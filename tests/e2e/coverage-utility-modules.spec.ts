import { expect, test } from "./helpers/instrumentedTest";

test.describe("runtime utility module coverage", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/docs/kitchen-sink.html?__test__=1", {
      waitUntil: "networkidle",
    });
  });

  test("exercises search filter parsing and serialization", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { parseFilterQuery, serializeFiltersToQuery } = await import(
        "/js/search/searchFilters.js"
      );

      const parsed = parseFilterQuery(
        'author:abc123 tag:#music,nostr kind:30078 relay:wss://relay.example after:2024-01-02 before:1707000000 duration:>=1.5m has:magnet nsfw:safe "exact phrase" looseTerm',
      );

      const withErrors = parseFilterQuery(
        "duration:oops has:bad unknown:value before:not-a-date",
      );

      const serialized = serializeFiltersToQuery(parsed.filters);

      return {
        parsed,
        withErrors,
        serialized,
      };
    });

    expect(result.parsed.filters.authorPubkeys).toEqual(["abc123"]);
    expect(result.parsed.filters.tags).toEqual(["music", "nostr"]);
    expect(result.parsed.filters.kind).toBe(30078);
    expect(result.parsed.filters.relay).toBe("wss://relay.example");
    expect(result.parsed.filters.duration.minSeconds).toBe(90);
    expect(result.parsed.filters.hasMagnet).toBe(true);
    expect(result.parsed.filters.nsfw).toBe("false");
    expect(result.parsed.text).toContain("exact phrase");
    expect(result.parsed.text).toContain("looseTerm");

    expect(result.withErrors.errors.length).toBeGreaterThanOrEqual(3);
    expect(result.withErrors.errors.some((e: any) => /Duration/.test(e.message))).toBe(true);
    expect(result.withErrors.errors.some((e: any) => /Has filter/.test(e.message))).toBe(true);
    expect(result.withErrors.errors.some((e: any) => /Date value/.test(e.message))).toBe(true);

    expect(result.serialized).toContain("author:abc123");
    expect(result.serialized).toContain("tag:music");
    expect(result.serialized).toContain("kind:30078");
    expect(result.serialized).toContain("has:magnet");
  });

  test("exercises video note payload normalization and error mapping", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const {
        normalizeVideoNotePayload,
        VIDEO_NOTE_ERROR_CODES,
        getVideoNoteErrorMessage,
      } = await import("/js/services/videoNotePayload.js");

      const invalid = normalizeVideoNotePayload({
        title: "",
        url: "http://insecure.example/video.mp4",
      });

      const normalized = normalizeVideoNotePayload({
        legacyFormData: {
          title: "  Coverage Video  ",
          url: "https://cdn.example/video.mp4  ",
          magnet:
            "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567",
          ws: "https://webseed.example/video.mp4",
          xs: "https://cdn.example/video.torrent",
          mode: "DEV",
          isPrivate: true,
          isNsfw: true,
          isForKids: true,
          storageProvider: "r2",
          fileSha256:
            "ABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD",
          originalFileSha256:
            "00112233445566778899AABBCCDDEEFF00112233445566778899AABBCCDDEEFF",
        },
        nip71: {
          summary: "  summary text ",
          publishedAt: "2024-05-01T12:00:00Z",
          duration: "120",
          hashtags: ["nostr", " video "],
          references: [" https://example.com/ref "],
          textTracks: [
            {
              url: " https://example.com/captions.vtt ",
              type: " subtitles ",
              language: " en ",
            },
          ],
          segments: [{ start: "0", end: "30", title: " Intro " }],
          participants: [
            {
              pubkey:
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              relay: " wss://relay.example ",
            },
          ],
          imeta: [
            {
              m: " VIDEO/MP4 ",
              url: "https://cdn.example/video.mp4",
              image: [" https://cdn.example/thumb.jpg "],
              duration: "98",
            },
          ],
        },
      });

      return {
        invalid,
        normalized,
        invalidUrlCode: VIDEO_NOTE_ERROR_CODES.INVALID_URL_PROTOCOL,
        invalidUrlMessage: getVideoNoteErrorMessage(
          VIDEO_NOTE_ERROR_CODES.INVALID_URL_PROTOCOL,
        ),
        fallbackMessage: getVideoNoteErrorMessage("unknown"),
      };
    });

    expect(result.invalid.errors).toContain(result.invalidUrlCode);
    expect(result.invalid.errors).toContain("missing_title");
    expect(result.invalidUrlMessage).toMatch(/HTTPS/i);
    expect(result.fallbackMessage).toMatch(/Unable to submit video/i);

    const legacy = result.normalized.payload.legacyFormData;
    expect(legacy.title).toBe("Coverage Video");
    expect(legacy.mode).toBe("dev");
    expect(legacy.isPrivate).toBe(true);
    expect(legacy.isNsfw).toBe(true);
    expect(legacy.isForKids).toBe(false);
    expect(legacy.storagePointer).toContain("r2:");
    expect(legacy.fileSha256).toHaveLength(64);
    expect(legacy.originalFileSha256).toHaveLength(64);
    expect(legacy.magnet).toContain("magnet:?xt=urn:btih:");
    expect(legacy.ws).toContain("https://webseed.example/video.mp4");
    expect(legacy.xs).toContain("https://cdn.example/video.torrent");

    const nip71 = result.normalized.payload.nip71;
    expect(nip71.summary).toBe("summary text");
    expect(nip71.duration).toBe(120);
    expect(nip71.imeta[0].m).toBe("video/mp4");
    expect(nip71.hashtags).toEqual(["nostr", "video"]);
    expect(nip71.segments[0].start).toBe(0);
    expect(nip71.participants[0].relay).toBe("wss://relay.example");
  });

  test("exercises attachment tag parsing and attachment descriptions", async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const {
        ATTACHMENT_KIND,
        parseAttachmentTags,
        extractAttachmentsFromMessage,
        formatAttachmentSize,
        describeAttachment,
      } = await import("/js/attachments/attachmentUtils.js");

      const parsed = parseAttachmentTags([
        ["x", "A".repeat(64)],
        ["url", "https://cdn.example/file.bin"],
        ["name", "manual.pdf"],
        ["type", "application/pdf"],
        ["size", "2048"],
        ["k", "secret"],
      ]);

      const noSource = parseAttachmentTags([["name", "nameless"]]);
      const extracted = extractAttachmentsFromMessage({
        message: {
          kind: ATTACHMENT_KIND,
          tags: [["x", "b".repeat(64)], ["url", "https://cdn.example/second.bin"]],
        },
      });
      const skipped = extractAttachmentsFromMessage({
        event: { kind: 1, tags: [["x", "c".repeat(64)]] },
      });

      return {
        parsed,
        noSource,
        extractedLength: extracted.length,
        extractedHash: extracted[0]?.x,
        skippedLength: skipped.length,
        sizeBytes: formatAttachmentSize(999),
        sizeKilobytes: formatAttachmentSize(2048),
        sizeMegabytes: formatAttachmentSize(1048576),
        describedName: describeAttachment(parsed),
        describedType: describeAttachment({ type: "image/png" }),
        describedFallback: describeAttachment(null),
      };
    });

    expect(result.parsed.x).toBe("a".repeat(64));
    expect(result.parsed.url).toBe("https://cdn.example/file.bin");
    expect(result.parsed.size).toBe(2048);
    expect(result.parsed.encrypted).toBe(true);
    expect(result.noSource).toBeNull();

    expect(result.extractedLength).toBe(1);
    expect(result.extractedHash).toBe("b".repeat(64));
    expect(result.skippedLength).toBe(0);

    expect(result.sizeBytes).toBe("999 B");
    expect(result.sizeKilobytes).toBe("2.0 KB");
    expect(result.sizeMegabytes).toBe("1.0 MB");
    expect(result.describedName).toBe("Attachment: manual.pdf");
    expect(result.describedType).toBe("Attachment (image/png)");
    expect(result.describedFallback).toBe("Attachment");
  });
});
