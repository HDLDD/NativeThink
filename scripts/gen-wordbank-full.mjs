// Wordbank mega-generator - produces CET4/CET6/IELTS/TOEFL/Advanced data files
import fs from 'fs';

function esc(s){ return String(s||'').replace(/\/g,'\\').replace(/'/g,"\'"); }

// Generate a full word entry line
function E(w,pos,mean,phon,level,freq,colls,syns,ants,family,reg,emo,topics,noCn,deep,ex1en,ex1zh,ex2en,ex2zh){
  var ex = JSON.stringify([{en:ex1en,zh:ex1zh},{en:ex2en,zh:ex2zh}]).replace(/'/g,"\'");
  var c = JSON.stringify(colls||[]);
  var s = JSON.stringify(syns||[]);
  var a = JSON.stringify(ants||[]);
  var f = JSON.stringify(family||[]);
  var t = JSON.stringify(topics||[]);
  var d = esc(deep||('关于'+esc(w)+'的详细解释。'));
  return "  {word:'"+esc(w)+"',phonetic:'"+esc(phon)+"',partOfSpeech:'"+esc(pos)+"',meaning:'"+esc(mean)+"',level:'"+level+"',frequencyRank:"+freq+",collocations:"+c+",examples:"+ex+",synonyms:"+s+",antonyms:"+a+",wordFamily:"+f+",register:'"+reg+"',emotion:'"+emo+"',topics:"+t+",hasNoChineseEquivalent:"+!!noCn+",deepExplanation:'"+d+"'},";
}

// Basic entry from compact data
function B(w,pos,mean,level,freq,phon,colls,tops){
  var ph = phon||'';
  var cs = colls||[];
  var ts = tops||['general'];
  var defMeaning = mean||(w+'释义');
  return E(w,pos,defMeaning,ph,level,freq,cs,[],[],[],'neutral','neutral',ts,false,'','','');
}

console.log('Generating wordbank data files...');
