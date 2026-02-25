import { ingestEvents, getRelevantMemories } from '../../src/services/memory/index.js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Parse environment variables
const fallbackCadence = 'daily';
const cadence = process.env.SCHEDULER_CADENCE || fallbackCadence;
const agentId = process.env.SCHEDULER_AGENT || `scheduler-memory-${cadence}`;
const promptPath = process.env.SCHEDULER_PROMPT_PATH || '';
const runId = process.env.SCHEDULER_RUN_ID ||
              process.env.SCHEDULER_SESSION_ID ||
              process.env.RUN_ID ||
              `session-${Date.now().toString(36)}`;

// Extract prompt intent
let promptIntent = `scheduler memory retrieval`;
if (promptPath) {
    try {
        const promptRaw = readFileSync(promptPath, 'utf8');
        const promptLines = promptRaw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        const intentLine = promptLines.find(line => line.startsWith('#') || line.toLowerCase().startsWith('goal'));
        if (intentLine) {
            promptIntent = intentLine.replace(/^#+\s*/, '');
        } else if (promptLines.length > 0) {
            promptIntent = promptLines[0];
        }
    } catch (err) {
        console.warn(`Could not read prompt file: ${promptPath}`, err.message);
    }
}

// Construct query
const query = ['scheduler', cadence, 'agent', agentId, 'intent', promptIntent].join(' | ');
const timestamp = Date.now();

// Create retrieval seed event
const events = [{
    agent_id: agentId,
    content: `Memory retrieval seed for ${cadence} :: ${promptIntent}`,
    timestamp,
    tags: ['scheduler', cadence, 'retrieve'],
    metadata: {
        session_id: runId,
        source: 'scheduler-retrieve',
        importance: 0.4,
        prompt_path: promptPath
    }
}];

try {
    // 1. Ingest seed event
    const ingested = await ingestEvents(events, { agent_id: agentId });

    // 2. Retrieve memories
    const retrieved = await getRelevantMemories({ agent_id: agentId, query, k: 5 });

    // 3. Prepare artifacts
    const sessionDir = path.join('.scheduler-memory', runId);
    const latestDir = path.join('.scheduler-memory', 'latest', cadence);

    mkdirSync(sessionDir, { recursive: true });
    mkdirSync(latestDir, { recursive: true });

    const artifact = {
        cadence,
        operation: 'retrieve',
        runId,
        servicePath: 'src/services/memory/index.js#getRelevantMemories',
        inputs: {
            agentId,
            promptPath,
            promptIntent,
            query,
            events: events.length
        },
        outputs: {
            ingestedCount: ingested.length,
            retrievedCount: retrieved.length
        },
        status: 'ok'
    };

    // 4. Write artifacts
    writeFileSync(path.join(sessionDir, 'retrieve.json'), JSON.stringify(artifact, null, 2));
    writeFileSync(path.join(sessionDir, 'retrieve.ok'), 'MEMORY_RETRIEVED\n');
    writeFileSync(path.join(latestDir, 'retrieve.ok'), 'MEMORY_RETRIEVED\n');
    // Format retrieved memories as readable markdown sections.
    // Prefer m.summary (compact excerpt) over m.content (full blob) for prompt injection.
    const memoriesMarkdown = retrieved.length > 0
      ? retrieved.map((m, i) => {
          const date = new Date(m.created_at || m.last_seen || Date.now()).toISOString().split('T')[0];
          const tagStr = Array.isArray(m.tags) && m.tags.length > 0 ? m.tags.join(', ') : '';
          const text = (m.summary || m.content || '').trim();
          return `### ${i + 1}. [${date}]${tagStr ? ` (${tagStr})` : ''}\n\n${text}`;
        }).join('\n\n---\n\n')
      : '_No memories found for this agent. This may be the first run or the memory store is empty._';
    writeFileSync(path.join(latestDir, 'memories.md'), memoriesMarkdown);

    // 5. Output success marker to stdout (for scheduler verification)
    console.log('MEMORY_RETRIEVED');
} catch (error) {
    console.error('Memory retrieval failed:', error);
    process.exit(1);
}
