import test from "node:test";
import assert from "node:assert/strict";
import { createKidsScorerStage } from "../../js/feedEngine/kidsScoring.js";

test("kids scorer correctly identifies dominant positive component", async () => {
  const stage = createKidsScorerStage({
      weights: {
          w_age: 0.2,
          w_edu: 0.2,
          w_author: 0.2,
          w_pop: 0.2,
          w_fresh: 0.2,
          w_risk: 0
      }
  });

  // Create an item where one component is clearly dominant
  // Age appropriateness: 1.0 (perfect duration + tags)
  // Others: 0
  const items = [
    {
      video: {
        id: "v1",
        pubkey: "pk1",
        duration: 300, // 5 min (perfect for toddler/preschool)
        tags: [["t", "preschool"], ["t", "learning"]], // Matches preferred
        created_at: Date.now() / 1000 - 10000000, // Old
        viewCount: 0
      },
      metadata: {},
    },
  ];

  const why = [];
  const context = {
      runtime: {
          ageGroup: "preschool",
          trustedAuthors: []
      },
      addWhy: (detail) => why.push(detail)
  };

  await stage(items, context);

  assert.equal(why.length, 1);
  assert.equal(why[0].reason, "age-appropriateness");
  assert.ok(why[0].value > 0);
});

test("kids scorer picks educational-boost when dominant", async () => {
  const stage = createKidsScorerStage({
    educationalTags: ["math"],
    weights: { w_age: 0, w_edu: 1, w_author: 0, w_pop: 0, w_fresh: 0, w_risk: 0 }
  });

  const items = [{
      video: {
          id: "v2",
          tags: [["t", "math"]],
          duration: 300
      },
      metadata: {}
  }];

  const why = [];
  await stage(items, {
      runtime: { educationalTags: ["math"] },
      addWhy: (d) => why.push(d)
  });

  assert.equal(why.length, 1);
  assert.equal(why[0].reason, "educational-boost");
});
