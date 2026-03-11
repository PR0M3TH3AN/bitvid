#!/bin/bash
git add .scheduler-memory/
git add torch/task-logs/
git commit -m "chore: run torch-garbage-collection-agent daily run" -m "This logs the failed run of the garbage collector daily task, writing to _failed.md, and correctly updating the scheduler memory."
