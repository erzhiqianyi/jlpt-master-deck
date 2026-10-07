import {test} from 'node:test';import assert from 'node:assert/strict';
import {tools,toolJsonSchema} from './mcp-tools.mjs';
test('MCP registry discovery exposes real versioned contracts for all types without saving content',async()=>{
 const tool=tools.find(t=>t.name==='get_question_registry');assert.ok(tool);assert.equal(toolJsonSchema(tool).type,'object');
 const result=await tool.handler({}, {ownerId:'1'});const data=result.structuredContent??JSON.parse(result.content[0].text);
 assert.equal(data.schemaVersion,1);assert.equal(data.types.length,23);
 const formation=data.types.find(t=>t.id==='vocabulary-word-formation');assert.deepEqual(formation.applicableLevels,['N2']);assert.ok(formation.explanationSteps.length>=2);
 const expression=data.types.find(t=>t.id==='listening-expression');assert.deepEqual(expression.applicableLevels,['N3','N4','N5']);
 assert.equal(data.types.find(t=>t.id==='reading-basic-training').supplementary,true);
});
