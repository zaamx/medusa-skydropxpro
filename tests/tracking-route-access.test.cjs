// Route handlers are transpiled from staged source. DI replaces provider,
// workflow, and tracking service: no HTTP, purchases, or database calls occur.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const roots = [process.cwd(), path.resolve(process.cwd(), '../hcw-store-medusa')]
for (let dir = __dirname; dir !== path.dirname(dir); dir = path.dirname(dir)) roots.push(dir, path.join(dir, 'hcw-store-medusa'))
const ts = require(require.resolve('typescript', { paths: roots }))
const apiRoot = path.resolve(__dirname, '../src/api/admin/skydropxpro')
const routes = [
  ['pickups', 'GET'], ['pickups', 'POST'], ['pickups/[id]', 'GET'], ['pickups/[id]', 'POST'],
  ['pickups/coverage', 'GET'], ['shipments', 'GET'], ['shipments', 'POST'], ['shipments/[id]', 'GET'],
  ['shipments/[id]/cancel', 'POST'], ['shipments/[id]/protect', 'POST'],
]

function fixture(route, method, headers, tracking = undefined) {
  const calls = []
  const carrier = new Proxy({}, { get: (_target, property) => async (...args) => {
    calls.push({ method: String(property), args })
    return { success: true, data: { id: 'synthetic-provider-id', attributes: { status: 'scheduled' } } }
  } })
  const filename = path.join(apiRoot, route, 'route.ts')
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, strict: true }, reportDiagnostics: true })
  assert.equal(compiled.diagnostics?.filter(row => row.category === ts.DiagnosticCategory.Error).length ?? 0, 0)
  const instance = new Module(filename, module)
  instance.filename = filename
  instance.require = name => {
    if (name === '@medusajs/framework/utils') return { Modules: { STOCK_LOCATION: 'stock_location' } }
    if (name.endsWith('/modules/skydropxpro')) return { SKYDROPPX_MODULE: 'skydropx' }
    if (name.endsWith('/modules/skydropxpro/service')) return { default: class {} }
    if (name.includes('/workflows/create-shipment-skydropxpro')) return { createShipmentSkydropxproWorkflow: () => ({ run: async ({ input }) => {
      calls.push({ method: 'native-legacy-workflow', args: [input] }); return { result: { success: true } }
    } }) }
    throw new Error('Unexpected route dependency: ' + name)
  }
  instance._compile(compiled.outputText, filename)
  const request = { headers, params: { id: 'provider-test-id' }, query: { shipment_id: 'shipment-test', page: '1' },
    body: { dry_run: false, pickup: { reference_shipment_id: 'shipment-test' }, reason: 'fixture-only', declared_value: 10 },
    auth_context: { actor_type: 'user', actor_id: 'user-test' }, scope: { resolve(name) {
      if (name === 'skydropx_tracking') return tracking
      if (name === 'skydropx') return carrier
      throw new Error('Unexpected route resolution: ' + name)
    } } }
  const response = { statusCode: 200, body: undefined,
    status(value) { this.statusCode = value; return this },
    set() { return this },
    json(value) { this.body = value; return this },
  }
  return { request, response, calls, run: () => instance.exports[method](request, response) }
}

for (const [route, method] of routes) {
  test(`${method} ${route}: APP identity cannot fall back when tracking module is absent`, async () => {
    const f = fixture(route, method, { 'x-ballena-supabase-token': 'synthetic-app-token' })
    await f.run()
    assert.equal(f.response.statusCode, 503)
    assert.deepEqual(f.calls, [], 'no legacy provider or workflow invocation')
  })
  test(`${method} ${route}: standalone native backoffice fallback remains available without APP header`, async () => {
    const f = fixture(route, method, {})
    await f.run()
    assert.ok([200, 201].includes(f.response.statusCode))
    assert.equal(f.calls.length, 1)
  })
}

test('present APP header is detected case-insensitively even if malformed or empty', async () => {
  for (const headers of [{ 'X-Ballena-Supabase-Token': '' }, { 'x-ballena-supabase-token': [] }, { 'X-BALLENA-SUPABASE-TOKEN': undefined }]) {
    const f = fixture('pickups', 'POST', headers)
    await f.run()
    assert.equal(f.response.statusCode, 503); assert.deepEqual(f.calls, [])
  }
})

test('registered tracking authorization errors never fall back to the legacy carrier', async () => {
  const tracking = {
    async authorizeRequest() { throw Object.assign(new Error('Access denied fixture'), { statusCode: 403 }) },
    async authorizeResource() { throw Object.assign(new Error('Access denied fixture'), { statusCode: 403 }) },
  }
  for (const [route, method] of routes) {
    const f = fixture(route, method, { 'x-ballena-supabase-token': 'synthetic-app-token' }, tracking)
    await f.run()
    assert.ok(f.response.statusCode >= 400, `${method} ${route}`)
    assert.deepEqual(f.calls, [], `${method} ${route}`)
  }
})
