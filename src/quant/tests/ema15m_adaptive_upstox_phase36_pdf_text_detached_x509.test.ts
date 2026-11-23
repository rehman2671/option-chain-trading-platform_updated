import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {X509Certificate,createHash} from 'node:crypto';
import {
  chmodSync,existsSync,mkdtempSync,mkdirSync,readFileSync,
  rmSync,writeFileSync
} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  auditPhase36ExtractedEcnText,matchPhase36ExtractedText,
  type Phase36ExtractRequest,type Phase36TextReport
} from '../../server/engine/ema15m/adaptiveUpstoxPhase36PdfTextAnnexure.js';
import {
  reviewPhase36DetachedX509,reviewPhase36EcnTextAndDetachedSigner,
  type Phase36DetachedCertificateInput,
  type Phase36IndependentCertificatePins
} from '../../server/engine/ema15m/adaptiveUpstoxPhase36DetachedSignerPins.js';
import type {Phase35PdfsigReport}
  from '../../server/engine/ema15m/adaptiveUpstoxPhase35LocalPdfsig.js';
import type {Phase33NoteTradeRow}
  from '../../server/engine/ema15m/adaptiveUpstoxPhase33ContractNoteReview.js';

const hash=(v:Uint8Array)=>createHash('sha256').update(v).digest('hex');
const trade={
  tradeId:'SYNTH_TRADE_36',orderId:'SYNTH_ORDER_36',
  tradeDate:'2026-11-16',tradeTimeIst:'10:01:01',
  exchange:'NFO' as const,symbol:'NIFTY',optionType:'CE' as const,
  strikePrice:24000,expiry:'2026-12-24',side:'BUY' as const,
  quantity:65,priceRupees:'250.0000'
};
const trade2={...trade,tradeId:'SYNTH_TRADE_37',
  orderId:'SYNTH_ORDER_37',side:'SELL' as const,
  priceRupees:'251.0000'};
const first='ANNEXURE FNO TRADES',last='END OF ANNEXURE';
const line=(t:Phase33NoteTradeRow)=>[
  t.tradeId,t.orderId,t.tradeDate,t.tradeTimeIst,t.exchange,
  t.symbol,t.optionType,String(t.strikePrice),t.expiry,t.side,
  String(t.quantity),t.priceRupees
].join(' ');
function syntheticallyGeneratedPdf(lines:string[]):Buffer{
  // Valid 1-page ORIGINAL synthetic text PDF, not a signed ECN.
  // Build with exact xref offsets so real pdftotext can parse it.
  const escape=(s:string)=>s.replace(/\\/g,'\\\\')
    .replace(/\(/g,'\\(').replace(/\)/g,'\\)');
  const operators=[
    'BT','/F1 10 Tf','40 745 Td',
    ...lines.flatMap((s,i)=>i?[ '0 -16 Td','('+escape(s)+') Tj']:
      ['('+escape(s)+') Tj']),
    'ET'
  ].join('\n');
  const objs=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length '+Buffer.byteLength(operators,'latin1')+
      ' >>\nstream\n'+operators+'\nendstream'
  ];
  let pdf='%PDF-1.4\n';
  const offsets=[0];
  for(let i=0;i<objs.length;i++){
    offsets.push(Buffer.byteLength(pdf,'latin1'));
    pdf+=(i+1)+' 0 obj\n'+objs[i]+'\nendobj\n';
  }
  const start=Buffer.byteLength(pdf,'latin1');
  pdf+='xref\n0 6\n0000000000 65535 f \n';
  for(const offset of offsets.slice(1))
    pdf+=String(offset).padStart(10,'0')+' 00000 n \n';
  pdf+='trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n'+
    start+'\n%%EOF\n';
  return Buffer.from(pdf,'latin1');
}
function fixture(lines=[
  first,line(trade),line(trade2),last
]){
  const dir=mkdtempSync(join(tmpdir(),'phase36-ecn-'));
  chmodSync(dir,0o700);
  const pdfPath=join(dir,'ecn.pdf');
  const bytes=syntheticallyGeneratedPdf(lines);
  writeFileSync(pdfPath,bytes,{mode:0o600});
  const fileHash=hash(bytes);
  const toolPath='/usr/bin/pdftotext';
  const toolHash=existsSync(toolPath)?hash(readFileSync(toolPath)):
    '00'.repeat(32);
  const phase35={
    status:'LOCAL_PDFSIG_CRYPTO_AND_NSS_TRUST_REPORTED_UNVERIFIED',
    localToolActuallyExecuted:true,
    originalPdfSha256:fileHash,
    executionAuthorized:false,productionSafe:false,
    brokerAuthenticated:false,brokerStopInstalled:false,
    protectedOvernight:false,onlineOcspChecked:false
  } as Phase35PdfsigReport;
  const req:Phase36ExtractRequest={
    schemaVersion:'ADAPTIVE_V2_PHASE36_PRIVATE_ECN_TEXT_V1',
    originalPdfPath:pdfPath,
    expectedOriginalPdfSha256:fileHash,
    pdftotextBinary:toolPath as '/usr/bin/pdftotext',
    expectedPdftotextBinarySha256:toolHash,
    timeoutMs:1500,annexureStartMarker:first,
    annexureEndMarker:last,
    selectedRows:[{...trade},{...trade2}],
    independentlyExpectedSelectedRowCount:2,
    operatorAuthorization:'APPROVED_NO_EGRESS_ECN_TEXT_EXTRACTION'
  };
  return {dir,pdfPath,req,phase35,cleanup:()=>
    rmSync(dir,{recursive:true,force:true})};
}
const safety=(r:Phase36TextReport)=>{
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.brokerAuthenticated,false);
  assert.equal(r.brokerStopInstalled,false);
  assert.equal(r.protectedOvernight,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.equal(r.digitalPdfSignatureVerifiedByThisModule,false);
  assert.equal(r.brokerIssuerAuthenticated,false);
  assert.equal(r.nativeStopHistoryVerified,false);
  assert.equal(r.extractedSelectedTradeRowCoverageComplete,false);
  assert.ok(!JSON.stringify(r).includes(trade.tradeId));
  assert.ok(!JSON.stringify(r).includes(trade.orderId));
};
const report=(f:ReturnType<typeof fixture>)=>
  auditPhase36ExtractedEcnText(f.req,f.phase35);
describe('Phase36 actual text-layer annexure match parser',()=>{
  it('strict synthetic annexure lines can be matched offline without issuer proof',()=>{
    const v=matchPhase36ExtractedText([
      'SYNTHETIC DOCUMENT',first,line(trade),line(trade2),
      last,'UNSIGNED DOCUMENT'
    ].join('\n'),[{...trade},{...trade2}],first,last,2);
    assert.deepEqual(v,{ok:true,reason:'',matched:2});
  });
  it('missing, duplicate, split or tampered trade rows fail closed',()=>{
    const cases=[
      {input:[first,line(trade),last].join('\n'),
        reason:'MISSING_OR_EXCESSIVE_ANNEXURE_TEXT_LINES'},
      {input:[first,line(trade),line(trade),line(trade2),last].join('\n'),
        reason:'DUPLICATE_OR_AMBIGUOUS_TRADE_ANNEXURE_TEXT_ROW'},
      {input:[first,line(trade).replace('250.0000','260.0000'),
        line(trade2),last].join('\n'),
        reason:'MISSING_OR_SPLIT_TRADE_ANNEXURE_TEXT_ROW'},
      {input:[first,'SYNTH_TRADE_36','SYNTH_ORDER_36',
        line(trade2),last].join('\n'),
        reason:'MISSING_OR_SPLIT_TRADE_ANNEXURE_TEXT_ROW'},
      {input:[first,line(trade),line(trade2),first,last].join('\n'),
        reason:'MISSING_DUPLICATE_OR_REVERSED_ANNEXURE_BOUNDARY'},
      {input:[last,first,line(trade),line(trade2)].join('\n'),
        reason:'MISSING_DUPLICATE_OR_REVERSED_ANNEXURE_BOUNDARY'}
    ];
    for(const {input,reason} of cases){
      const v=matchPhase36ExtractedText(input,
        [{...trade},{...trade2}],first,last,2);
      assert.equal(v.ok,false);
      assert.equal(v.reason,reason,JSON.stringify(v));
    }
  });
  it('extra selected row count, duplicated input ID and malformed text reject',()=>{
    const text=[first,line(trade),line(trade2),last].join('\n');
    assert.equal(matchPhase36ExtractedText(text,[trade,trade2],
      first,last,3).reason,'INVALID_EXTRACTED_TEXT_OR_PINNED_ROW_SCOPE');
    assert.equal(matchPhase36ExtractedText(text,[trade,trade],
      first,last,2).reason,'DUPLICATE_INPUT_TRADE_ID');
    assert.equal(matchPhase36ExtractedText(text+'\uFFFD',
      [trade,trade2],first,last,2).reason,
      'INVALID_EXTRACTED_TEXT_OR_PINNED_ROW_SCOPE');
  });
});
describe('Phase36 real offline Poppler pdftotext and signed-PDF prerequisite',()=>{
  it('rejects a missing Phase35 signed preflight before any real executable',()=>{
    const f=fixture();
    try{
      const r=report({...f,phase35:{
        ...f.phase35,status:'PDFSIG_PROCESS_OR_SIGNATURE_REJECTED'
      }});
      safety(r);
      assert.equal(r.status,'INVALID_PRECONDITION');
      assert.equal(r.realNativeExtraction,false);
    }finally{f.cleanup();}
  });
  it('rejects mismatched source PDF and pdftotext executable binary pins',()=>{
    const f=fixture();
    try{
      f.req.expectedOriginalPdfSha256='11'.repeat(32);
      assert.equal(report(f).status,'INVALID_PRECONDITION');
      f.req.expectedOriginalPdfSha256=f.phase35.originalPdfSha256!;
      f.req.expectedPdftotextBinarySha256='22'.repeat(32);
      assert.equal(report(f).status,'INVALID_PRECONDITION');
    }finally{f.cleanup();}
  });
  it('rejects public original document permissions and missing consent',()=>{
    const f=fixture();
    try{
      chmodSync(f.pdfPath,0o644);
      const a=report(f);safety(a);
      assert.equal(a.status,'INVALID_PRECONDITION');
      chmodSync(f.pdfPath,0o600);
      f.req.operatorAuthorization='MISSING' as
        'APPROVED_NO_EGRESS_ECN_TEXT_EXTRACTION';
      assert.equal(report(f).status,'INVALID_PRECONDITION');
    }finally{f.cleanup();}
  });
  it('mock process cannot claim real PDF extraction even with perfect text',()=>{
    const f=fixture();
    try{
      const stdout=Buffer.from([first,line(trade),line(trade2),last]
        .join('\n'));
      const a=auditPhase36ExtractedEcnText(f.req,f.phase35,
        (bin,args,timeout)=>{
          assert.equal(bin,'/usr/bin/pdftotext');
          assert.deepEqual(args,[
            '-layout','-enc','UTF-8','-nopgbrk',f.pdfPath,'-'
          ]);
          assert.equal(timeout,1500);
          return {exitCode:0,stdout,stderr:new Uint8Array(),timedOut:false};
        });
      safety(a);
      assert.equal(a.status,'PDF_TEXT_EXTRACTION_REJECTED');
      if(existsSync('/usr/bin/pdftotext'))
        assert.deepEqual(a.reasons,
          ['MOCK_TEXT_NOT_ACTUAL_POPPLER_EXTRACTION']);
    }finally{f.cleanup();}
  });
  it('native extraction of actual synthetic PDF text works, no signed ECN claim',()=>{
    if(!existsSync('/usr/bin/pdftotext'))return;
    const f=fixture();
    try{
      const a=report(f);safety(a);
      assert.equal(a.status,'TEXT_LAYER_ROWS_MATCHED_UNVERIFIED',
        JSON.stringify(a));
      assert.equal(a.realNativeExtraction,true);
      assert.equal(a.actualPdfTextCompared,true);
      assert.equal(a.extractedTradeRowsMatched,2);
    }finally{f.cleanup();}
  });
  it('native missing scanned/text-only fields reject even when PDF valid',()=>{
    if(!existsSync('/usr/bin/pdftotext'))return;
    const f=fixture([first,line(trade),last]);
    try{
      const a=report(f);safety(a);
      assert.equal(a.status,'PDF_TEXT_EXTRACTION_REJECTED');
      assert.deepEqual(a.reasons,
        ['MISSING_OR_EXCESSIVE_ANNEXURE_TEXT_LINES']);
    }finally{f.cleanup();}
  });
});
function certificateFixture(){
  if(!existsSync('/usr/bin/openssl'))return null;
  const dir=mkdtempSync(join(tmpdir(),'phase36-x509-'));
  chmodSync(dir,0o700);
  const caKey=join(dir,'ca.key'),caPem=join(dir,'ca.pem'),
    leafKey=join(dir,'leaf.key'),csr=join(dir,'leaf.csr'),
    leafPem=join(dir,'leaf.pem'),ext=join(dir,'leaf.ext');
  try{
    const cmd=(args:string[])=>execFileSync('/usr/bin/openssl',args,{
      stdio:['ignore','pipe','pipe'],timeout:10000});
    cmd(['req','-x509','-newkey','rsa:2048','-nodes',
      '-keyout',caKey,'-out',caPem,'-subj','/CN=Phase36 Fake Test CA',
      '-days','1','-addext','basicConstraints=critical,CA:TRUE',
      '-addext','keyUsage=critical,keyCertSign,cRLSign']);
    cmd(['req','-newkey','rsa:2048','-nodes','-keyout',leafKey,
      '-out',csr,'-subj','/CN=Phase36 Fake Detached ECN Signer']);
    writeFileSync(ext,'basicConstraints=critical,CA:FALSE\n'+
      'keyUsage=critical,digitalSignature\n',{mode:0o600});
    cmd(['x509','-req','-in',csr,'-CA',caPem,'-CAkey',caKey,
      '-CAcreateserial','-out',leafPem,'-days','1','-sha256',
      '-extfile',ext]);
    const signer=new X509Certificate(readFileSync(leafPem)),
      issuer=new X509Certificate(readFileSync(caPem));
    const instant=new Date().toISOString();
    const input:Phase36DetachedCertificateInput={
      schemaVersion:'ADAPTIVE_V2_PHASE36_DETACHED_CERTIFICATE_REVIEW_V1',
      source:'SEPARATELY_PROVISIONED_UNVERIFIED',
      originalPdfSha256:'a1'.repeat(32),
      signerCertificateDerBase64:signer.raw.toString('base64'),
      issuerCertificateDerBase64:issuer.raw.toString('base64'),
      evaluationAsOf:instant
    };
    const pins:Phase36IndependentCertificatePins={
      schemaVersion:'INDEPENDENT_PHASE36_X509_PINS_V1',
      originalPdfSha256:input.originalPdfSha256,
      expectedSignerDerSha256:hash(signer.raw),
      expectedIssuerDerSha256:hash(issuer.raw),
      evaluationAsOf:instant,
      expectedIssuerTrustModel:'EXTERNALLY_PINNED_SELF_SIGNED_CA_ONLY'
    };
    return {dir,input,pins,cleanup:()=>
      rmSync(dir,{recursive:true,force:true})};
  }catch(error){
    rmSync(dir,{recursive:true,force:true});throw error;
  }
}
describe('Phase36 detached signer/issuer X509 pins no embedded PDF association',()=>{
  it('real synthetic signer cert signed by pinned CA remains unlinked to PDF',()=>{
    const f=certificateFixture();if(!f)return;
    try{
      const r=reviewPhase36DetachedX509(f.input,f.pins);
      assert.equal(r.status,
        'DETACHED_SIGNER_ISSUER_CHAIN_CONSISTENT_UNLINKED',
        JSON.stringify(r));
      assert.equal(r.detachedSignerIssuedByPinnedCa,true);
      assert.equal(r.certificateEmbeddedInPdfSignatureVerified,false);
      assert.equal(r.brokerIssuerIdentityVerified,false);
      assert.equal(r.revocationStatusVerified,false);
      assert.equal(r.executionAuthorized,false);
      assert.equal(r.brokerStopInstalled,false);
      assert.ok(!JSON.stringify(r).includes('Phase36 Fake'));
    }finally{f.cleanup();}
  });
  it('wrong independent pins and expired evaluation dates reject',()=>{
    const f=certificateFixture();if(!f)return;
    try{
      assert.equal(reviewPhase36DetachedX509(f.input,{
        ...f.pins,expectedSignerDerSha256:'00'.repeat(32)
      }).status,'DETACHED_CERTIFICATE_REJECTED');
      const changed={...f.input,evaluationAsOf:'2000-01-01T00:00:00Z'};
      assert.equal(reviewPhase36DetachedX509(changed,{
        ...f.pins,evaluationAsOf:changed.evaluationAsOf
      }).status,'DETACHED_CERTIFICATE_REJECTED');
      assert.equal(reviewPhase36DetachedX509(f.input,{
        ...f.pins,originalPdfSha256:'ff'.repeat(32)
      }).status,'INVALID_EVIDENCE');
    }finally{f.cleanup();}
  });
  it('even consistent detached signer with fake Phase35 never activates trading',()=>{
    const f=certificateFixture();if(!f)return;
    try{
      const signer=reviewPhase36DetachedX509(f.input,f.pins);
      const text={
        status:'TEXT_LAYER_ROWS_MATCHED_UNVERIFIED',
        realNativeExtraction:true,actualPdfTextCompared:true,
        originalPdfSha256:'a1'.repeat(32),
        executionAuthorized:false
      } as Phase36TextReport;
      const phase35={
        status:'LOCAL_PDFSIG_CRYPTO_AND_NSS_TRUST_REPORTED_UNVERIFIED',
        originalPdfSha256:'a1'.repeat(32),
        executionAuthorized:false
      } as Phase35PdfsigReport;
      const combined=reviewPhase36EcnTextAndDetachedSigner(
        phase35,text,signer);
      assert.equal(combined.status,
        'TEXT_AND_DETACHED_CERT_PINS_LOCALLY_CONSISTENT_UNVERIFIED');
      assert.equal(combined.pdfCertificateSignerLinkVerified,false);
      assert.equal(combined.brokerAuthenticated,false);
      assert.equal(combined.realNativeStopOrderAckVerified,false);
      assert.equal(combined.nativeOrderInstruction,null);
    }finally{f.cleanup();}
  });
});
