# Changelog

## [1.0.0] - 2025-01-XX

### Major Changes
- **BREAKING**: Updated to work with the latest Skydropx Pro API
- **BREAKING**: Changed API base URL to `https://pro.skydropx.com/api/v1`
- **BREAKING**: Updated OAuth authentication flow
- **BREAKING**: Updated field names and API structure for quotations and shipments

### New Features
- Added Orders API endpoints (GET, POST, PATCH)
- Added Products API endpoint
- Added Shipment Protection API
- Added Shipment Cancellation API
- Added Shipment Tracking API
- Added Printing Format Settings API
- Added comprehensive error handling
- Added new API routes for all new endpoints

### API Structure Updates
- Updated quotation API to use `parcels` array instead of `parcel` object
- Updated address fields: `name` → `person_name`, `apartment_number` → `internal_number`
- Updated country codes to use uppercase format ("MX" instead of "mx")
- Updated amount and total fields to be returned as strings
- Updated shipment creation to use new package structure
- Removed `scope` parameter from OAuth authentication

### New API Endpoints Added
- `GET /admin/skydropxpro/orders` - List orders
- `POST /admin/skydropxpro/orders` - Create order
- `GET /admin/skydropxpro/orders/{id}` - Get order by ID
- `PATCH /admin/skydropxpro/orders/{id}` - Update order
- `GET /admin/skydropxpro/products` - List products
- `POST /admin/skydropxpro/shipments/{id}/cancel` - Cancel shipment
- `POST /admin/skydropxpro/shipments/{id}/protect` - Protect shipment
- `GET /admin/skydropxpro/shipments/tracking` - Track shipment
- `PATCH /admin/skydropxpro/settings/printing-formats` - Update printing format

### Service Method Updates
- Updated `authenticate()` method for new OAuth flow
- Updated `getQuotations()` and `getQuotationById()` for new API structure
- Updated `createShipment()` for new package structure
- Updated address formatting methods
- Added new methods for orders, products, tracking, protection, and cancellation

### Error Handling Improvements
- Improved error logging with proper error propagation
- Added consistent error response format
- Better handling of API errors with detailed logging
- **BREAKING**: Changed from throwing errors to logging them and returning error objects
- Added centralized error handling with `handleApiError()` method
- Added input validation to prevent crashes from invalid data
- Added graceful fallbacks for missing or invalid data
- Improved error messages with method context

### Documentation
- Updated README with comprehensive usage instructions
- Added API endpoint documentation
- Added environment variables documentation
- Added usage examples for all new features

### Technical Improvements
- Updated TypeScript types for new API responses
- Improved request headers with proper Content-Type
- Better parameter handling for API requests
- Enhanced retry logic for async operations

## [0.0.2] - Previous Version
- Initial release with basic shipping functionality
- Basic quotation and shipment creation
- Limited API coverage 