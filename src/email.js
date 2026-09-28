const {ImapFlow}=require("imapflow");
const nodemailer=require("nodemailer");
class EmailService{
 constructor({onMail}={}){this.client=null;this.config=null;this.onMail=onMail;this.seen=new Set();this.timer=null}
 async configure(config){
  await this.signOut();this.config=config||{};const c=this.config.incoming||{};
  if(!c.host||!c.user||!c.password)return {ok:false,error:"Incoming email settings are incomplete."};
  if(c.protocol==="pop3")return this.configurePop3();
  this.client=new ImapFlow({host:c.host,port:Number(c.port||993),secure:c.secure!==false,auth:{user:c.user,pass:c.password},logger:false});
  await this.client.connect();await this.pollImap();this.timer=setInterval(()=>this.pollImap().catch(e=>console.error("IMAP poll:",e)),60000);return {ok:true};
 }
 async pollImap(){
  if(!this.client)return {ok:false,error:"Not connected"};
  const lock=await this.client.getMailboxLock((this.config.incoming&&this.config.incoming.mailbox)||"INBOX");
  try{
   const uids=await this.client.search({seen:false},{uid:true});let count=0;
   for(const uid of uids.slice(-20)){if(this.seen.has(uid))continue;const msg=await this.client.fetchOne(uid,{envelope:true,source:true},{uid:true});if(!msg)continue;this.seen.add(uid);count++;this.onMail?.({uid,subject:msg.envelope?.subject||"(no subject)",from:msg.envelope?.from?.map(x=>x.address||x.name).filter(Boolean).join(", ")||"",date:msg.envelope?.date||null,source:msg.source?.toString("utf8").slice(0,200000)||""})}
   return {ok:true,count};
  }finally{lock.release()}
 }
 async configurePop3(){
  const net=require("net"),tls=require("tls"),c=this.config.incoming;
  const socket=await new Promise((resolve,reject)=>{const done=s=>{s.once("error",reject);resolve(s)};const s=c.secure!==false?tls.connect({host:c.host,port:Number(c.port||995),servername:c.host},()=>done(s)):net.connect({host:c.host,port:Number(c.port||110)},()=>done(s))});
  const read=()=>new Promise((resolve,reject)=>{let b="";const on=d=>{b+=d.toString();if(/\r?\n$/.test(b)){socket.off("data",on);resolve(b)}};socket.on("data",on);socket.once("error",reject)});
  const cmd=async v=>{socket.write(v+"\r\n");return read()};
  let line=await read();if(!line.startsWith("+OK"))throw new Error("POP3 server rejected connection");
  line=await cmd("USER "+c.user);if(!line.startsWith("+OK"))throw new Error("POP3 username rejected");
  line=await cmd("PASS "+c.password);if(!line.startsWith("+OK"))throw new Error("POP3 password rejected");
  line=await cmd("STAT");const match=line.match(/\+OK\s+(\d+)/);const count=match?Number(match[1]):0;await cmd("QUIT");socket.end();return {ok:true,count};
 }
 async checkNow(){if(this.client)return this.pollImap();if(this.config?.incoming?.protocol==="pop3")return this.configurePop3();return {ok:false,error:"Email is not configured."}}
 async signOut(){if(this.timer)clearInterval(this.timer);this.timer=null;try{await this.client?.logout()}catch{}this.client=null}
 async send(mail){const o=this.config?.smtp||{};if(!o.host||!o.user||!o.password)throw new Error("SMTP is not configured.");const transporter=nodemailer.createTransport({host:o.host,port:Number(o.port||465),secure:o.secure!==false,auth:{user:o.user,pass:o.password}});return transporter.sendMail(mail)}
}
module.exports={EmailService};
