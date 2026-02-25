import { createLifecyclePlan } from '../src/services/memory/pruner.js';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';

const ITERATIONS = 3;
const GROUPS = 100;
const GROUP_SIZE = 5;
const LATENCY_MS = 10;

function createMemory(overrides = {}) {
  return {
    schema_version: 1,
    id: overrides.id ?? crypto.randomUUID(),
    agent_id: overrides.agent_id ?? 'agent-1',
    session_id: overrides.session_id ?? 's1',
    type: overrides.type ?? 'event',
    content: overrides.content ?? 'default content',
    summary: overrides.summary ?? 'default summary',
    tags: overrides.tags ?? [],
    importance: overrides.importance ?? 0.5,
    embedding_id: overrides.embedding_id ?? null,
    created_at: overrides.created_at ?? Date.now(),
    last_seen: overrides.last_seen ?? Date.now(),
    source: overrides.source ?? 'ingest',
    ttl_days: overrides.ttl_days ?? null,
    merged_into: overrides.merged_into ?? null,
    pinned: overrides.pinned ?? false,
  };
}

function generateMemories() {
  const memories = [];
  const now = Date.now();

  for (let i = 0; i < GROUPS; i++) {
    const groupId = `group-${i}`;
    for (let j = 0; j < GROUP_SIZE; j++) {
      memories.push(createMemory({
        id: `${groupId}-${j}`,
        content: `Memory ${j} for group ${groupId}`,
        summary: `Summary ${j} for group ${groupId}`,
        tags: ['benchmark', groupId],
        created_at: now - (j * 100), // Close in time
        last_seen: now,
        importance: 0.5,
      }));
    }
  }

  // Add some random noise memories that won't group
  for (let i = 0; i < 50; i++) {
    memories.push(createMemory({
      id: `noise-${i}`,
      content: `Noise memory ${i}`,
      tags: [`noise-${i}`], // Unique tags to prevent grouping
      created_at: now - (i * 100000), // Spread out
    }));
  }

  return memories;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runBenchmark() {
  console.log(`Setting up benchmark: ${GROUPS} groups of ${GROUP_SIZE} memories + noise.`);
  console.log(`Mock latency: ${LATENCY_MS}ms per group condensation.`);

  const memories = generateMemories();

  // Prepare embeddings
  const groupEmbeddings = new Map();
  for (let i = 0; i < GROUPS; i++) {
    const vec = new Array(GROUPS).fill(0);
    vec[i] = 1;
    groupEmbeddings.set(`group-${i}`, vec);
  }

  const getEmbeddingWrapper = (memory) => {
    const groupIdTag = memory.tags.find(t => t.startsWith('group-'));
    if (groupIdTag && groupEmbeddings.has(groupIdTag)) {
      return groupEmbeddings.get(groupIdTag);
    }
    // Return a unique random vector for noise to prevent grouping
    // But since they have unique tags, getEmbedding won't even be called for similarity check
    // if tag overlap check fails first?
    // groupNearDuplicates logic:
    // ... if (!withinWindow || !hasTagOverlap(base.tags, probe.tags)) continue;
    // So if tags don't overlap, it continues.
    // So embedding doesn't matter for noise if tags are unique.
    return [Math.random()];
  };

  const options = {
    retentionMs: 30 * 24 * 60 * 60 * 1000, // 30 days
    duplicateWindowMs: 1000 * 60 * 60, // 1 hour
    similarityThreshold: 0.99,
    getEmbedding: getEmbeddingWrapper,
    generateSummary: async (_prompt) => {
      await delay(LATENCY_MS);
      return JSON.stringify({
        summary: 'Condensed summary based on prompt.',
        importance: 0.8,
      });
    },
    // Mock templateDir to avoid file reading issues if paths are tricky,
    // but loadMemoryPromptTemplates reads from file system.
    // It should work if run from root.
  };

  console.log(`Starting ${ITERATIONS} iterations...`);

  const times = [];

  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    const plan = await createLifecyclePlan(memories, options);
    const duration = performance.now() - start;

    // Verify grouping happened
    const condensedCount = plan.condensedGroups.length;
    // We expect exactly GROUPS condensed groups.
    if (condensedCount !== GROUPS) {
        console.warn(`Warning: Expected ${GROUPS} condensed groups, but got ${condensedCount}. Check grouping logic.`);
    }

    times.push(duration);
    console.log(`Iteration ${i + 1}: ${duration.toFixed(2)}ms`);
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`Average execution time: ${avg.toFixed(2)}ms`);
}

runBenchmark().catch(console.error);
