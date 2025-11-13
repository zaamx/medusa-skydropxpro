The current shipping-rate flow works per warehouse (almacén) as described below:

1. **Group order items by almacen ID**
   - Each line item SKU is expected to follow `product_sku||almacenId`.
   - `getAlmacenIdFromItem` parses `variant_sku`, extracts the substring after `||`, and normalizes it.
   - Items lacking a valid almacen identifier fall back to the `"default"` bucket, and any issues are logged.

2. **Iterate warehouses and build shipment inputs**
   - The grouped dictionary is traversed in `calculateShippingRates`.
   - For each `[warehouseId, items]` pair:
     - `calculatePackageDetails` summarizes dimensions/weight.
     - `getOriginAddress(warehouseId)` resolves the origin address. It:
       - Normalizes the ID and early-returns the default address if no almacen ID is present.
       - Attempts to fetch a matching stock location via `stockLocationModuleService.listStockLocations`, checking multiple selectors (`id`, `metadata.almacen_id_unico`, etc.).
       - Maps the stock location (and its metadata) into the Skydropx origin-address shape.
       - Falls back to environment-based defaults if no stock location is found or the module is unavailable.
     - `getDestinationAddress` uses the cart shipping address and `zipDetails`.

3. **Quote per warehouse**
   - With origin/destination/package details prepared, the service builds a Skydropx quotation payload.
   - A request is sent via `getQuotations`; if incomplete, it polls `getQuotationById` until completion or timeout.
   - Successful responses are normalized into `SkydropxCalculatedRate` entries. Each rate ID is kept compatible (`skydropx_${provider_name}_${service_code}`) to avoid downstream changes.

4. **Return warehouse-specific rates**
   - The method returns an array of `{ warehouse_id, rates }`, preserving warehouse separation for later selections.

Shipment creation follows the same pattern: when fulfilling per warehouse, the service refilters items by almacen ID, resolves the corresponding origin address again, and submits the shipment request with the selected rate. 

