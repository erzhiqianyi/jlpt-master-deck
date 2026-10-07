import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ensureCardReviewSchema,insertCardReview,mergedCardProgress} from './card-review-history.mjs';
test('legacy mixed-count rating events retain their contribution while new subjective events only advance SRS',()=>{
 const db=new DatabaseSync(':memory:');try{
 db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY);INSERT INTO users VALUES(1);
 CREATE TABLE card_reviews(user_id INTEGER,event_id TEXT,item_id TEXT,rating TEXT,reviewed_at TEXT,source TEXT,PRIMARY KEY(user_id,event_id));
 INSERT INTO card_reviews VALUES(1,'legacy','IT1','easy','2026-10-01T00:00:00.000Z','ios');`);
 ensureCardReviewSchema(db);
 assert.equal(db.prepare('SELECT count_semantics FROM card_reviews').get().count_semantics,'legacy_mixed');
 db.prepare('INSERT INTO card_review_sync_baselines VALUES(?,?,?)').run(1,'IT1',JSON.stringify({correct:5,wrong:2,reviewCount:7}));
 db.exec("INSERT INTO card_review_sync_events VALUES(1,'legacy','IT1')");
 const event={eventId:'new',itemId:'IT1',rating:'forgot',reviewedAt:'2026-10-02T00:00:00Z'};
 insertCardReview(db,1,event);
 const result=mergedCardProgress(db,1,'IT1','new',{});
 assert.equal(result.correct,6,'old event remains part of legacy mixed totals');assert.equal(result.wrong,2,'new forgot is not an objectively wrong answer');
 assert.equal(result.reviewCount,9);assert.equal(result.intervalDays,0);
 assert.equal(db.prepare("SELECT count_semantics FROM card_reviews WHERE event_id='new'").get().count_semantics,'subjective_only');
 assert.equal(insertCardReview(db,1,event),false);
 }finally{db.close();}
});
