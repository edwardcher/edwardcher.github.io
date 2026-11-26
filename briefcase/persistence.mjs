import {pack,unpack} from './portable.mjs';
export const storageKey='edwardcher.briefcase.project.v1';
export function restore(storage){const raw=storage.getItem(storageKey);return raw===null?null:unpack(JSON.parse(raw));}
export function persist(storage,state){storage.setItem(storageKey,JSON.stringify(pack(state)));}
export function clear(storage){storage.removeItem(storageKey);}
