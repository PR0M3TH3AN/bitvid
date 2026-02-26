import { ingestEvents } from '../../src/services/memory/index.js';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
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
let promptIntent = `scheduler memory store`;
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

// Check for memory input file
let memoryContent = '';
const cliArgs = process.argv.slice(2);
const fileArgIndex = cliArgs.indexOf('--file');
const explicitFile = fileArgIndex !== -1 ? cliArgs[fileArgIndex + 1] : null;
const envFile = process.env.SCHEDULER_MEMORY_FILE;
const defaultFile = 'memory-update.md';

const targetFile = explicitFile || (envFile && existsSync(envFile) ? envFile : (existsSync(defaultFile) ? defaultFile : null));

if (targetFile) {
    try {
        if (existsSync(targetFile)) {
            memoryContent = readFileSync(targetFile, 'utf8').trim();
            console.log(`Loaded memory content from ${targetFile}`);
        } else {
             console.warn(`Target memory file does not exist: ${targetFile}`);
        }
    } catch (err) {
        console.warn(`Failed to read memory file ${targetFile}:`, err.message);
    }
}

const baseTs = Date.now();
let events = [];

if (memoryContent) {
    events.push({
        agent_id: agentId,
        content: memoryContent,
        timestamp: baseTs,
        tags: ['scheduler', cadence, 'store', 'insight'],
        metadata: {
            session_id: runId,
            source: 'agent-output',
            importance: 0.8, // User-provided memory is important
            prompt_path: promptPath
        }
    });
} else {
    // No memory file found — skip ingest rather than storing meaningless placeholder events.
    // Placeholder events pollute the store and degrade retrieval quality on future runs.
    console.warn(`No memory input found (checked --file, env SCHEDULER_MEMORY_FILE=${envFile}, and default ${defaultFile}). Skipping ingest.`);
}

try {
    // 1. Ingest events
    const stored = await ingestEvents(events, { agent_id: agentId });

    // 2. Prepare artifacts
    const sessionDir = path.join('.scheduler-memory', runId);
    const latestDir = path.join('.scheduler-memory', 'latest', cadence);

    mkdirSync(sessionDir, { recursive: true });
    mkdirSync(latestDir, { recursive: true });

    const artifact = {
        cadence,
        operation: 'store',
        runId,
        servicePath: 'src/services/memory/index.js#ingestEvents',
        inputs: {
            agentId,
            promptPath,
            promptIntent,
            events: events.length,
            sourceFile: targetFile || 'none'
        },
        outputs: {
            storedCount: stored.length,
            summaries: stored.map(m => m.summary)
        },
        status: 'ok'
    };

    // 3. Write artifacts
    writeFileSync(path.join(sessionDir, 'store.json'), JSON.stringify(artifact, null, 2));
    writeFileSync(path.join(sessionDir, 'store.ok'), 'MEMORY_STORED\n');
    writeFileSync(path.join(latestDir, 'store.ok'), 'MEMORY_STORED\n');

    // 4. Output success marker to stdout (for scheduler verification)
    console.log('MEMORY_STORED');
} catch (error) {
    console.error('Memory storage failed:', error);
    process.exit(1);
}
