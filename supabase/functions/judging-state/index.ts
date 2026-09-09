import C from './core.mjs';
import { createHandler } from './handler.mjs';
Deno.serve(createHandler(C, name => Deno.env.get(name)));
