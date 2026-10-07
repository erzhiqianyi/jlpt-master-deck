import {JlptDatabase as BaseDatabase} from '../api-worker.mjs';
export class JlptDatabase extends BaseDatabase {
 async fetch(request){const path=new URL(request.url).pathname;
  if(path==='/__fixture/inspect')return Response.json({tables:this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all(),deletes:this.ctx.storage.kv.get('media-deletes')??null,alarm:await this.ctx.storage.getAlarm()});
  if(path==='/__fixture/seed'){this.db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,password_hash TEXT,salt TEXT,created_at TEXT);INSERT INTO users VALUES(1,'private','password-secret','salt-secret','now');INSERT INTO users VALUES(2,'other-owner','other-secret','salt-secret','now');CREATE TABLE progress(user_id INTEGER,item_id TEXT,progress_json TEXT,updated_at TEXT,PRIMARY KEY(user_id,item_id));INSERT INTO progress VALUES(1,'word','{\"stability\":7}','now');INSERT INTO progress VALUES(2,'hidden','{}','now');CREATE TABLE sessions(token TEXT);INSERT INTO sessions VALUES('live-session');");this.ctx.storage.kv.put('media-deletes',['keep-me']);await this.ctx.storage.setAlarm(Date.now()+86400000);await this.env.MEDIA.put('item-images/keep-me','fixture');return new Response('seeded');}
  if(path==='/__fixture/alarm'){await this.alarm();return new Response('no-op');}
  return super.fetch(request);
 }
}
export default {fetch(request,env){return env.JLPT_DATABASE.get(env.JLPT_DATABASE.idFromName('primary-v1')).fetch(request);}};
