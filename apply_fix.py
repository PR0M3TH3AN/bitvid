
import os

filepath = 'js/dmDecryptor.js'

with open(filepath, 'r') as f:
    content = f.read()

search_block = """  for (const decryptor of ordered) {
    for (const remotePubkey of remoteCandidates) {
      try {
        const plaintext = await decryptor.decrypt(remotePubkey, ciphertext, {
          event,
          stage: "content",
          remotePubkey,
        });

        if (typeof plaintext === "string") {
          const resolvedScheme =
            normalizeScheme(hints.algorithms?.[0]) ||
            normalizeScheme(decryptor.scheme) ||
            "";
          return buildDecryptResult({
            ok: true,
            event,
            message: {
              ...cloneEvent(event),
              content: plaintext,
            },
            plaintext,
            recipients,
            senderPubkey,
            actorPubkey,
            decryptor,
            scheme: resolvedScheme,
          });
        }
      } catch (error) {
        errors.push({
          scheme: decryptor.scheme || "",
          source: decryptor.source || "",
          stage: "content",
          remotePubkey,
          error,
        });
      }
    }
  }

  return buildDecryptResult({
    ok: false,
    event,
    actorPubkey,
    errors,
  });"""

replace_block = """  const attemptDecryption = async (decryptor, remotePubkey) => {
    try {
      const plaintext = await decryptor.decrypt(remotePubkey, ciphertext, {
        event,
        stage: "content",
        remotePubkey,
      });

      if (typeof plaintext === "string") {
        const resolvedScheme =
          normalizeScheme(hints.algorithms?.[0]) ||
          normalizeScheme(decryptor.scheme) ||
          "";
        return buildDecryptResult({
          ok: true,
          event,
          message: {
            ...cloneEvent(event),
            content: plaintext,
          },
          plaintext,
          recipients,
          senderPubkey,
          actorPubkey,
          decryptor,
          scheme: resolvedScheme,
        });
      }
      throw new Error("Decrypted content was not a valid string.");
    } catch (error) {
      throw {
        scheme: decryptor.scheme || "",
        source: decryptor.source || "",
        stage: "content",
        remotePubkey,
        error,
      };
    }
  };

  const attempts = [];
  for (const decryptor of ordered) {
    for (const remotePubkey of remoteCandidates) {
      attempts.push(attemptDecryption(decryptor, remotePubkey));
    }
  }

  try {
    return await Promise.any(attempts);
  } catch (aggregateError) {
    const aggregatedErrors = aggregateError.errors || [];
    errors.push(...aggregatedErrors);

    return buildDecryptResult({
      ok: false,
      event,
      actorPubkey,
      errors,
    });
  }"""

if search_block in content:
    new_content = content.replace(search_block, replace_block)
    with open(filepath, 'w') as f:
        f.write(new_content)
    print("Successfully replaced content.")
else:
    print("Search block not found.")
    # Debug: print what we have roughly where it should be
    start_idx = content.find("for (const decryptor of ordered) {")
    if start_idx != -1:
        print("Found start of block, but full block mismatch.")
        print("Existing content snippet:")
        print(content[start_idx:start_idx+500])
