import { readFileSync } from 'node:fs';
import { lintPackage } from '../src/authoring/lint';
const p = JSON.parse(readFileSync('content-src/constitution.quiz.json', 'utf8'));
console.log(JSON.stringify(lintPackage(p), null, 1));
