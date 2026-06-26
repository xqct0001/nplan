#!/usr/bin/env node
import { LocalPlanningAgent } from './agent.js';

const request = process.argv.slice(2).join(' ');

if (!request) {
  console.error('Usage: local-task-agent "<request>"');
  process.exit(1);
}

console.log(JSON.stringify(new LocalPlanningAgent().analyze(request), null, 2));
