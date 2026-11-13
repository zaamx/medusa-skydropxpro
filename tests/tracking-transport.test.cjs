const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http')
process.env.SUPABASE_URL='http://127.0.0.1:55521'
process.env.SUPABASE_SERVICE_ROLE_KEY='local-transport-test-only'
process.env.NO_PROXY='127.0.0.1,localhost'
const Service=require('../.medusa/server/src/modules/skydropxpro/service.js').default
const logger={debug(){},info(){},warn(){},error(){}}

test('Skydropx transport over a real local HTTP server; no carrier account used',async t=>{
 const requests=[]
 const server=http.createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk
  const parsed=new URL(req.url,'http://127.0.0.1'),body=raw?Object.fromEntries(new URLSearchParams(raw)):null
  requests.push({method:req.method,path:parsed.pathname,query:parsed.search,raw,body})
  res.setHeader('content-type','application/json')
  if(parsed.pathname==='/api/v1/oauth/token')return res.end(JSON.stringify({access_token:'local-http-test-token',expires_in:7200}))
  if(parsed.pathname==='/api/v2/pickups/eligible_shipments')return res.end(JSON.stringify({groups:[{origin_address_id:'origin-hash',carrier:'test-carrier',type:'national_no_ltl',shipment_ids:['shipment-1']}],meta:{current_page:Number(parsed.searchParams.get('page')),next_page:null,total_pages:2}}))
  if(parsed.pathname==='/api/v2/pickups'&&req.method==='POST')return res.end(JSON.stringify({data:{id:'pickup-1',type:'pickups',attributes:{status:'in_progress'}}}))
  if(parsed.pathname==='/api/v2/pickups/pickup-1/reschedule')return res.end(JSON.stringify({data:{id:'pickup-2',type:'pickups',attributes:{status:'scheduled'}}}))
  if(parsed.pathname==='/api/v2/pickups/pickup-1')return res.end(JSON.stringify({data:{id:'pickup-1',type:'pickups',attributes:{status:'scheduled'}}}))
  if(parsed.pathname==='/api/v1/shipments'&&req.method==='POST')return res.end(JSON.stringify({data:{id:'shipment-1',type:'shipments',attributes:{workflow_status:'in_progress'}}}))
  res.statusCode=404;res.end(JSON.stringify({error:'Unexpected test request'}))
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const apiUrl=`http://127.0.0.1:${server.address().port}/api/v1`
 const service=new Service({logger},{apiUrl,apiKey:'local-client',apiSecret:'local-secret'})
 try{
  await t.test('OAuth concurrent calls share one token request',async()=>{
   const values=await Promise.all([service.authenticate(),service.authenticate(),service.authenticate()])
   assert.deepEqual(values,['local-http-test-token','local-http-test-token','local-http-test-token'])
   assert.equal(requests.filter(r=>r.path==='/api/v1/oauth/token').length,1)
  })
  await t.test('V2 eligibility preserves page query and version',async()=>{
   const result=await service.getEligiblePickupShipments(2)
   assert.equal(result.groups[0].origin_address_id,'origin-hash')
   const request=requests.at(-1)
   assert.equal(request.path,'/api/v2/pickups/eligible_shipments')
   assert.match(request.query,/page=2/)
   assert.match(request.query,/per_page=20/)
  })
  await t.test('V2 pickup preserves selected shipments and records the first response without polling',async()=>{
   const body={pickup:{shipment_ids:['shipment-1'],scheduled_from:'2026-11-13 09:00',scheduled_to:'2026-11-13 14:00'}}
   let saved=null
   const result=await service.createPickupV2(body,async value=>{saved=value})
   assert.equal(result.data.attributes.status,'in_progress')
   assert.equal(saved.data.id,'pickup-1')
   const sent=JSON.parse(requests.at(-1).raw)
   assert.deepEqual(sent,body)
   assert.equal('packages'in sent.pickup,false)
   assert.equal('total_weight'in sent.pickup,false)
   assert.equal(requests.filter(r=>r.method==='GET'&&r.path.includes('/pickups/pickup-1')).length,0)
  })
  await t.test('V2 reschedule returns a new folio without rewriting the previous identifier',async()=>{
   const result=await service.reschedulePickupV2('pickup-1',{pickup:{shipment_ids:['shipment-1'],scheduled_from:'2026-11-14 09:00',scheduled_to:'2026-11-14 14:00'}})
   assert.equal(result.data.id,'pickup-2')
   assert.equal(requests.at(-1).path,'/api/v2/pickups/pickup-1/reschedule')
  })
  await t.test('A tracking capture failure propagates without a second pickup purchase',async()=>{
   const before=requests.filter(r=>r.path==='/api/v2/pickups'&&r.method==='POST').length
   await assert.rejects(service.createPickupV2({pickup:{shipment_ids:['shipment-1']}},async()=>{throw Error('Simulated durable-store failure')}),/durable-store failure/)
   assert.equal(requests.filter(r=>r.path==='/api/v2/pickups'&&r.method==='POST').length,before+1)
  })
  await t.test('Tracked shipment captures its identifier immediately and does not enter the legacy polling loop',async()=>{
   service.getOriginAddress=async()=>({country_code:'MX',postal_code:'01000',area_level1:'Ciudad de México',area_level2:'QA',area_level3:'QA',street1:'QA1',name:'QA sender',company:'QA',phone:'0000000000',email:'sender@example.invalid'})
   const order={items:[{id:'item-1',variant_sku:'QA-SKU||QA-WH',quantity:1,unit_price:100,title:'QA product'}],
    shipping_address:{first_name:'QA',last_name:'receiver',postal_code:'01000',province:'CMX',city:'Ciudad de México',address_1:'QA2',phone:'0000000000'},email:'receiver@example.invalid',
    shipping_methods:[{metadata:{warehouse_id:'QA-WH',original_rate:{metadata:{id:'rate-test'}}}}]}
   let saved=null
   const result=await service.createShipment(order,'01000', {items:[{line_item_id:'item-1',quantity:1}]},'QA-WH',undefined,async value=>{saved=value})
   assert.equal(saved.data.id,'shipment-1')
   assert.equal(result.shipment.data.id,'shipment-1')
   assert.equal(result.success,false)
   assert.equal(requests.filter(r=>r.path==='/api/v1/shipments'&&r.method==='POST').length,1)
   assert.equal(requests.filter(r=>r.method==='GET'&&r.path==='/api/v1/shipments/shipment-1').length,0)
  })
  await t.test('Previously patched Mexican destination normalization remains available',()=>{
   const address=service.getDestinationAddress({email:'qa@example.invalid',shipping_address:{first_name:'QA',last_name:'test',postal_code:'97000',province:'YUC',city:'Mérida',address_1:'QA',phone:'0000000000'}},'97000')
   assert.equal(address.area_level1,'Yucatan')
   assert.equal(address.area_level2,'Mérida')
  })
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
})
