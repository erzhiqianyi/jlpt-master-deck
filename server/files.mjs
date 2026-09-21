import * as fs from 'node:fs';
import { currentPlatform } from './platform.mjs';

const call = (name, args) => (currentPlatform()?.files ?? fs)[name](...args);
export const existsSync = (...args) => call('existsSync', args);
export const mkdirSync = (...args) => call('mkdirSync', args);
export const readdirSync = (...args) => call('readdirSync', args);
export const readFileSync = (...args) => call('readFileSync', args);
export const statSync = (...args) => call('statSync', args);
export const unlinkSync = (...args) => call('unlinkSync', args);
export const writeFileSync = (...args) => call('writeFileSync', args);
export const createReadStream = (...args) => call('createReadStream', args);
