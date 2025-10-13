# solver-storage

Developer documentation for the storage abstraction layer in the OIF solver system.

## Purpose & Overview

The `solver-storage` crate provides a pluggable storage layer for persisting solver data across the OIF (Open Intents Framework) system. This crate handles the storage of orders, intents, quotes, and other solver-related entities with support for querying, indexing, and automatic expiration.

### Core Capabilities

The storage layer offers several key capabilities that solver components rely on:

**Type-Safe Operations**: The crate provides generic methods for storing and retrieving data with automatic JSON serialization. This eliminates manual serialization logic throughout the codebase and ensures type safety at compile time.

**Query and Indexing**: Storage entries can be indexed by specific fields, enabling efficient queries across stored data. This supports use cases like finding all pending orders or retrieving intents for a specific user.

**Time-To-Live Management**: Data can be configured to automatically expire after a specified duration. This prevents unbounded storage growth and ensures stale data is cleaned up without manual intervention.

**Backend Flexibility**: The trait-based architecture allows different storage implementations to be swapped at runtime through configuration. This enables using in-memory storage for testing while using persistent file storage in production.

### Design Philosophy

The crate separates concerns into three distinct layers:

1. **Application Layer**: Business logic works with domain objects like `Order` and `Intent`
2. **Service Layer**: Type-safe operations with automatic serialization (`StorageService`)
3. **Backend Layer**: Raw byte-level storage operations (`StorageInterface` implementations)

This layering provides both convenience for common operations and low-level control when needed. Application code typically interacts with `StorageService`, which handles serialization and provides a clean API. The underlying backend can be swapped without changing application code.

### Namespace Organization

Storage keys follow a namespace pattern: `{namespace}:{id}`. For example:
- `orders:0x1234...` - An order entry
- `intents:abc123` - An intent entry
- `quotes:xyz789` - A quote entry

This namespacing serves multiple purposes:
- Prevents key collisions between different entity types
- Enables namespace-scoped queries and operations
- Allows per-namespace configuration like TTL settings
- Facilitates bulk operations on entity types

### Common Usage Pattern

The typical flow for using storage in the solver system:

```rust
// Initialize storage from configuration
let backend = create_storage_from_config(&config)?;
let storage = StorageService::new(backend);

// Store data with indexes
let order = Order { /* ... */ };
let indexes = StorageIndexes::new()
    .with_field("status", "pending")
    .with_field("user", &order.user);

storage.store("orders", &order.id, &order, Some(indexes)).await?;

// Query indexed data
let pending: Vec<(String, Order)> = storage.query(
    "orders",
    QueryFilter::Equals("status".into(), json!("pending"))
).await?;

// Retrieve specific entry
let order: Order = storage.retrieve("orders", &order_id).await?;
```

### Integration Points

The storage crate integrates with other solver components:

- **solver-core**: Stores order and intent state during execution
- **solver-discovery**: Caches discovered intents and chain information
- **solver-pricing**: Stores quote data with automatic expiration
- **solver-settlement**: Persists transaction hashes and settlement state

Each component uses the same `StorageService` interface but operates in its own namespace. This isolation prevents conflicts while maintaining a consistent storage API across the system.

---

## Storage Backends

The crate provides two built-in backend implementations, each suited for different use cases. Additional backends can be implemented by satisfying the `StorageInterface` trait.

### FileStorage Backend

The `FileStorage` implementation provides persistent, disk-based storage. This is the primary backend for production deployments.

#### Storage Format

Data is stored as binary files in the configured directory. Each file contains:
- A 64-byte header with metadata (magic bytes, version, expiration timestamp)
- The serialized data payload

The header format enables efficient TTL checks without reading the entire file. Files with the magic bytes `OIFS` include header information; files without these bytes are treated as legacy format for backward compatibility.

#### File Organization

```
{base_path}/
├── orders_order1.bin         # Data file for orders:order1
├── orders_order2.bin         # Data file for orders:order2
├── orders.index              # Index file for orders namespace
├── orders.lock               # Lock file for orders index
├── intents_intent1.bin       # Data file for intents:intent1
├── intents.index             # Index file for intents namespace
└── intents.lock              # Lock file for intents index
```

Keys are sanitized for filesystem safety by replacing `/` and `:` with `_`. For example, the key `orders:order123` becomes the file `orders_order123.bin`.

#### Index Structure

Each namespace maintains a separate index file (`.index`) containing a JSON structure:

```json
{
  "status": {
    "pending": ["orders:order1", "orders:order2"],
    "completed": ["orders:order3"]
  },
  "user": {
    "alice": ["orders:order1"],
    "bob": ["orders:order2", "orders:order3"]
  }
}
```

This structure enables O(1) lookups for equality queries. The index is updated atomically whenever indexed data is stored or deleted.

#### File Locking

The backend uses file-based locking to ensure consistency:
- **Exclusive locks** for index writes (one writer at a time)
- **Shared locks** for index reads (multiple concurrent readers)
- **Per-namespace locking** to minimize contention

Lock files (`.lock`) are created alongside index files. The locking uses OS-level file locks through the `fs2` crate, ensuring safety even across processes.

#### TTL Configuration

Time-to-live can be configured per namespace in the configuration file:

```toml
[storage]
type = "file"
storage_path = "./data/storage"
ttl_orders = 86400        # 24 hours
ttl_intents = 172800      # 48 hours
ttl_quotes = 1800         # 30 minutes
```

When storing data, the TTL for the namespace is automatically applied unless explicitly overridden. Expired data returns an `Expired` error when accessed and can be cleaned up using the `cleanup_expired()` method.

#### Atomic Writes

File writes are atomic to prevent corruption:
1. Data is written to a temporary file (`.tmp` extension)
2. The temporary file is renamed to the target path
3. On POSIX systems, `rename()` is atomic - either the old or new version exists

This ensures crash-safety during write operations. If the process crashes, either the old version remains or the new version is complete.

#### Batch Operations

The backend supports batch retrieval for efficient bulk reads:

```rust
let keys = vec![
    "orders:order1".to_string(),
    "orders:order2".to_string(),
    "orders:order3".to_string(),
];
let results = backend.get_batch(&keys).await?;
```

This is more efficient than individual `get_bytes()` calls as it can optimize I/O operations.

#### Configuration Options

```rust
use solver_storage::implementations::file;

let config = toml::from_str(r#"
    storage_path = "/var/lib/solver/storage"
    ttl_orders = 86400
    ttl_intents = 172800
"#)?;

let backend = file::create_storage(&config)?;
```

The storage path defaults to `./data/storage` if not specified. TTL values are in seconds, with 0 meaning no expiration.

### MemoryStorage Backend

The `MemoryStorage` implementation provides fast, ephemeral storage using an in-memory HashMap. This backend is designed for testing and development scenarios.

#### Storage Structure

Data is stored in memory using a HashMap data structure. The implementation supports concurrent access with multiple readers and a single writer pattern for efficient read-heavy workloads.

#### Feature Limitations

The memory backend intentionally omits certain features:

- **No TTL support**: Data never expires (acceptable for tests)
- **No indexing**: Queries return empty results
- **No persistence**: Data is lost on restart
- **No cleanup operations**: No expiration to clean up

These limitations keep the implementation simple and fast for its intended use case: testing.

#### Configuration

```rust
use solver_storage::implementations::memory;

let config = toml::from_str("")?;  // No configuration needed
let backend = memory::create_storage(&config)?;
```

The memory backend accepts an empty configuration. Any configuration values are ignored.

### Selecting a Backend

Backend selection happens through configuration:

```toml
[storage]
type = "file"  # or "memory"
# ... backend-specific configuration
```

The factory registry maps type strings to factory functions:

```rust
let implementations = get_all_implementations();
// Returns: [("file", file::create_storage), ("memory", memory::create_storage)]

let factory = implementations
    .iter()
    .find(|(name, _)| *name == storage_type)
    .map(|(_, factory)| factory)
    .ok_or("Unknown storage type")?;

let backend = factory(&config)?;
```

This approach allows runtime backend selection without recompiling. The solver can use different backends for different environments (memory for tests, file for production).

---

## Integration Architecture

The storage crate integrates into the solver system through a layered architecture. Understanding this structure helps when adding new storage operations or implementing custom backends.

### Layer Structure

#### StorageInterface

The foundation of the architecture is the `StorageInterface`. This interface defines the low-level operations that all backends must implement:

**Core Operations**:
- `get_bytes`: Retrieve data by key
- `set_bytes`: Store data with optional indexes and TTL
- `delete`: Remove data by key
- `exists`: Check if key exists
- `query`: Find keys matching filter criteria
- `get_batch`: Retrieve multiple keys efficiently
- `cleanup_expired`: Remove expired entries

Key design decisions:

**Byte-level operations**: The interface works with raw bytes rather than typed data. This keeps it generic and allows different serialization strategies.

**Asynchronous operations**: All I/O operations are non-blocking, enabling concurrent storage access.

**Optional features**: Indexing and TTL are optional parameters, allowing simpler backends to ignore them.

#### StorageService Layer

The `StorageService` wraps a backend and provides type-safe operations. This layer sits between application code and the raw storage backend.

**Key Operations**:
- `store`: Save typed data with optional indexes
- `retrieve`: Load and deserialize data by ID
- `update`: Modify existing entries
- `delete`: Remove entries
- `query`: Find entries matching criteria
- `retrieve_all`: Get all entries in a namespace

This layer provides:

**Type safety**: Methods work with domain objects (Order, Intent, etc.) rather than raw bytes
**Automatic serialization**: JSON encoding/decoding handled transparently
**Key construction**: Namespace and ID combined consistently into storage keys
**Error handling**: Backend errors translated to appropriate error types

Application code works with this layer, never touching raw bytes or serialization logic directly.

### Component Integration

#### Storage Service Initialization

Components initialize storage during startup:

```rust
// In solver-core initialization
pub struct SolverCore {
    storage: StorageService,
    // ... other fields
}

impl SolverCore {
    pub fn new(config: &Config) -> Result<Self, Error> {
        // Create backend from configuration
        let backend = create_storage_from_config(&config.storage)?;
        let storage = StorageService::new(backend);
        
        Ok(Self {
            storage,
            // ... initialize other fields
        })
    }
}
```

The storage service is then used throughout the component's lifecycle. Components typically store the `StorageService` as a field for convenient access.

#### Namespace Conventions

Each component operates in its own namespace:

```rust
// In solver-core
impl OrderManager {
    async fn store_order(&self, order: &Order) -> Result<()> {
        self.storage.store("orders", &order.id, order, Some(
            StorageIndexes::new()
                .with_field("status", &order.status)
                .with_field("user", &order.user)
        )).await
    }
}

// In solver-pricing
impl QuoteManager {
    async fn store_quote(&self, quote: &Quote) -> Result<()> {
        self.storage.store("quotes", &quote.id, quote, None).await
    }
}
```

Namespace conventions:
- `orders` - Order entities and state
- `intents` - Discovered and processed intents
- `quotes` - Price quotes with TTL
- `order_by_tx_hash` - Transaction hash to order ID mapping

These namespaces are defined in `solver-types` as the `StorageKey` enum, ensuring consistency across components.

#### Query Patterns

Components query storage using indexes:

```rust
// Find all pending orders
let pending_orders: Vec<(String, Order)> = self.storage.query(
    "orders",
    QueryFilter::Equals("status".into(), json!("pending"))
).await?;

// Find orders for a specific user
let user_orders: Vec<(String, Order)> = self.storage.query(
    "orders",
    QueryFilter::Equals("user".into(), json!("alice"))
).await?;

// Get all items in a namespace
let all_orders: Vec<(String, Order)> = self.storage
    .retrieve_all("orders")
    .await?;
```

Query operations return vectors of `(id, data)` tuples. The ID is extracted from the full key (`orders:order123` → `order123`).

### Error Handling

Storage operations return `Result<T, StorageError>`. Components handle these errors according to the operation:

```rust
match self.storage.retrieve("orders", &order_id).await {
    Ok(order) => {
        // Process order
    },
    Err(StorageError::NotFound(_)) => {
        // Order doesn't exist - may be expected
        return Ok(None);
    },
    Err(StorageError::Expired(_)) => {
        // Order expired - clean up references
        self.handle_expired_order(&order_id).await?;
        return Ok(None);
    },
    Err(e) => {
        // Unexpected error - propagate
        return Err(e.into());
    }
}
```

The error variants provide semantic information:

- `NotFound`: Key doesn't exist (often expected)
- `Expired`: Key exists but is past TTL
- `Serialization`: Data corruption or version mismatch
- `Backend`: I/O or system-level error
- `Configuration`: Invalid configuration

Components can distinguish between expected conditions (NotFound) and true errors (Backend).

### Factory Registration

The crate uses a registry pattern for backend discovery:

```rust
pub fn get_all_implementations() -> Vec<(&'static str, StorageFactory)> {
    vec![
        (file::Registry::NAME, file::Registry::factory()),
        (memory::Registry::NAME, memory::Registry::factory()),
    ]
}
```

Each backend implementation provides a registry:

```rust
pub struct Registry;

impl ImplementationRegistry for Registry {
    const NAME: &'static str = "file";
    type Factory = StorageFactory;
    
    fn factory() -> Self::Factory {
        create_storage
    }
}
```

This pattern enables:
- Automatic discovery of available backends
- Configuration-driven selection
- Easy addition of new backends

The solver configuration loader uses this registry to instantiate the correct backend at runtime.

---

## Data Persistence Patterns

The storage layer implements several patterns to ensure data integrity, efficient access, and proper lifecycle management. Understanding these patterns helps when working with storage in the solver system.

### Key-Value Storage Model

The fundamental storage model is key-value pairs with structured keys:

```
Key: "namespace:id"
Value: Serialized JSON data
Metadata: Indexes, TTL, timestamps
```

This model provides simplicity while supporting advanced features through metadata. The key structure enables efficient namespace operations like bulk queries or cleanup.

### Serialization Strategy

#### JSON Format

All data is serialized to JSON. This choice prioritizes:

**Human readability**: Storage files can be inspected and debugged without special tools
**Flexibility**: Fields can be added to data structures without breaking existing stored data
**Interoperability**: JSON is universally understood across languages and tools
**Schema evolution**: The format handles backward and forward compatibility naturally

Example serialization:

```json
{
  "id": "order123",
  "user": "alice",
  "amount": 1000,
  "status": "pending"
}
```

#### Versioning Considerations

JSON serialization handles schema evolution gracefully:

**Adding fields**: New fields with default values don't break old data. When reading old data that lacks the new field, a default value is used.

**Optional fields**: Fields that may not always be present can be marked as optional, allowing smooth migration between schema versions.

**Renaming fields**: Old field names can be accepted for backward compatibility while using new names internally.

### Indexing Strategy

#### Field-Based Indexes

Storage entries can be indexed by specific fields for efficient querying:

```rust
let indexes = StorageIndexes::new()
    .with_field("status", "pending")
    .with_field("user", "alice")
    .with_field("priority", 5);

storage.store("orders", &order.id, &order, Some(indexes)).await?;
```

The backend maintains an inverted index structure:
```
field -> value -> [keys]

"status" -> "pending" -> ["orders:order1", "orders:order2"]
"status" -> "completed" -> ["orders:order3"]
"user" -> "alice" -> ["orders:order1", "orders:order3"]
```

#### Index Selection

Choose which fields to index based on query patterns:

**Index fields that are queried**: If code queries by status, index the status field
**Avoid indexing unique values**: Indexing unique IDs provides no benefit
**Consider cardinality**: Low-cardinality fields (status, type) benefit most from indexing
**Balance index size**: Each indexed field increases storage overhead

Example query patterns:

```rust
// Query by status - requires status index
let pending = storage.query(
    "orders",
    QueryFilter::Equals("status".into(), json!("pending"))
).await?;

// Query by multiple values - requires user index
let results = storage.query(
    "orders",
    QueryFilter::In("user".into(), vec![
        json!("alice"),
        json!("bob")
    ])
).await?;
```

#### Index Maintenance

Indexes are updated atomically with data:

```rust
async fn set_bytes(
    &self,
    key: &str,
    value: Vec<u8>,
    indexes: Option<StorageIndexes>,
    ttl: Option<Duration>,
) -> Result<(), StorageError> {
    // 1. Write data file atomically
    self.write_data_file(key, value, ttl).await?;
    
    // 2. Update indexes
    if let Some(indexes) = indexes {
        self.update_indexes(key, indexes).await?;
    }
    
    Ok(())
}
```

The order matters: data is written before indexes. This ensures queries never return keys for non-existent data.

When deleting data, indexes are cleaned up:

```rust
async fn delete(&self, key: &str) -> Result<(), StorageError> {
    // 1. Delete data file
    self.remove_data_file(key).await?;
    
    // 2. Remove from all indexes
    self.remove_from_indexes(key).await?;
    
    Ok(())
}
```

Stale index entries are prevented by cleaning up on every delete operation.

### Time-To-Live Management

#### TTL Configuration

TTL can be configured at multiple levels:

**Namespace-level (recommended)**:
```toml
[storage]
ttl_orders = 86400      # All orders expire after 24 hours
ttl_quotes = 1800       # All quotes expire after 30 minutes
```

**Per-operation override**:
```rust
// Override namespace TTL for specific entry
storage.store_with_ttl(
    "orders",
    &order.id,
    &order,
    Some(indexes),
    Some(Duration::from_secs(3600))  // 1 hour instead of default
).await?;
```

#### TTL Implementation

TTL is stored in the file header as an absolute Unix timestamp:

```rust
struct FileHeader {
    magic: [u8; 4],
    version: u16,
    expires_at: u64,  // Unix timestamp, 0 = never expires
    padding: [u8; 50],
}
```

Expiration check on read:

```rust
async fn get_bytes(&self, key: &str) -> Result<Vec<u8>, StorageError> {
    let data = fs::read(&path).await?;
    let header = FileHeader::deserialize(&data)?;
    
    if header.is_expired() {
        return Err(StorageError::Expired(key.to_string()));
    }
    
    Ok(data[FileHeader::SIZE..].to_vec())
}
```

This approach checks expiration at read time rather than through background jobs. Expired data returns an error immediately.

#### Cleanup Operations

Periodic cleanup removes expired entries:

```rust
// Background cleanup task
tokio::spawn(async move {
    let mut interval = tokio::time::interval(Duration::from_secs(3600));
    loop {
        interval.tick().await;
        
        match storage.cleanup_expired().await {
            Ok(count) => {
                tracing::info!("Cleaned up {} expired entries", count);
            },
            Err(e) => {
                tracing::error!("Cleanup failed: {}", e);
            }
        }
    }
});
```

The cleanup process:
1. Scans all data files in storage directory
2. Reads headers to check expiration
3. Deletes expired files and updates indexes
4. Returns count of removed entries

Cleanup can be scheduled based on storage size and expiration rates. For short TTLs (minutes), run cleanup frequently. For long TTLs (days), run cleanup less often.

### Atomic Operations

#### Write Atomicity

File writes use atomic rename for crash safety:

1. Write data to a temporary file (`.tmp` extension)
2. Rename the temporary file to the target filename
3. The rename operation is atomic on POSIX systems

This ensures:
- Either the old version exists (if crash before rename)
- Or the new version exists (if crash after rename)
- Never a partially-written file

#### Index Update Atomicity

Index updates combine file locking with atomic writes:

1. Acquire exclusive lock on the index file
2. Load current index
3. Modify index entries
4. Write atomically to disk
5. Release lock

The lock ensures only one process modifies the index at a time. The atomic write ensures the index file is never corrupted.

### Concurrency Patterns

The storage backends support concurrent access with different strategies:

#### Memory Storage Concurrency

The memory backend allows multiple simultaneous reads but only one write at a time. This optimizes for read-heavy workloads common in storage operations:
- Multiple queries can run concurrently
- Write operations block until all reads complete
- Reads block while a write is in progress

#### File Storage Concurrency

The file backend uses per-namespace locking:
- Multiple readers can query the same namespace concurrently (shared locks)
- Writers acquire exclusive locks, blocking other readers and writers
- Different namespaces can be accessed concurrently without blocking each other

Example: Operations on "orders" and "intents" namespaces don't interfere with each other, allowing parallel processing across different entity types.

### Error Recovery

#### Corrupted Index Recovery

If an index file becomes corrupted, the system continues operating gracefully:

- The corrupted index is detected when loaded
- The system starts with an empty index structure
- Queries return no results until data is re-indexed
- The system remains functional, preventing total failure

This approach prioritizes availability over immediate consistency. Data files remain intact, and indexes can be rebuilt by re-storing entries.

#### Partial Query Failure

Query operations handle individual deserialization failures gracefully:

- If one item fails to deserialize, it is logged and skipped
- Other items in the query result are still returned
- This prevents a single corrupted entry from breaking entire queries
- The system continues operating with partial results

This resilience is important in production environments where occasional data corruption may occur, ensuring that the bulk of operations can continue while problematic entries are identified and fixed.

---

## Custom Storage Implementation

The storage architecture supports custom backends through the `StorageInterface` trait. This section guides developers through implementing a custom storage backend.

### Implementation Requirements

A custom storage backend must:

1. Implement the `StorageInterface` trait with all required methods
2. Provide a factory function matching the `StorageFactory` type signature
3. Implement a `Registry` struct for registration
4. Provide a configuration schema for validation

### Basic Implementation Template

A custom storage backend needs to implement these core operations:

**Data Operations**:
- `get_bytes`: Retrieve data by key
- `set_bytes`: Store data with optional indexes and TTL
- `delete`: Remove data by key
- `exists`: Check if key exists

**Query Operations**:
- `query`: Find keys matching filter criteria (optional, can return empty)
- `get_batch`: Efficiently retrieve multiple keys

**Metadata Operations**:
- `config_schema`: Define configuration requirements
- `cleanup_expired`: Remove expired entries (if TTL supported)

**Batch Retrieval Default**: If the backend doesn't have native batch support, batch retrieval can be implemented by calling `get_bytes` for each key individually.

### Redis Storage Example

Redis can be used as a distributed storage backend. Key implementation details:

**Data Storage**:
- Store values using Redis SET command
- Apply TTL using Redis SETEX for time-limited data
- Use key prefixes to namespace solver data

**Index Management**:
- Use Redis Sets for indexes
- Index keys follow pattern: `{prefix}:idx:{namespace}:{field}:{value}`
- Add entries to index sets using SADD command
- Query indexes using SMEMBERS to retrieve matching keys

**Query Implementation**:
- `Equals` filter: Query the specific index set
- `All` filter: Use KEYS command to scan namespace
- Other filters can be built using set operations (SUNION, SDIFF)

**TTL Handling**:
- Redis has native TTL support via SETEX command
- No manual cleanup needed - Redis expires keys automatically
- This is more efficient than file-based TTL

**Connection Management**:
- Maintain connection pool for performance
- Handle connection errors and reconnection
- Convert Redis errors to StorageError types

### Configuration Schema

Define what configuration parameters the backend requires:

**Required Parameters**:
- Parameters that must be provided (e.g., `redis_url`)
- Missing required parameters cause startup failure

**Optional Parameters**:
- Parameters with default values (e.g., `key_prefix` defaults to "solver")
- System continues if not provided

The schema validates configuration at startup, providing clear error messages for misconfiguration.

### Factory Function

The factory function creates storage instances from configuration:

1. Validate configuration against schema
2. Extract configuration parameters
3. Apply defaults for optional parameters
4. Create and initialize the backend
5. Return the storage instance

This function is called during system startup when the storage backend is initialized from configuration files.

### Registry Implementation

Register the backend for automatic discovery:

1. Define a unique name for the backend (e.g., "redis", "file", "memory")
2. Provide the factory function
3. Register in the global implementations list

Once registered, the backend can be selected via configuration using its name.

### Integration

To integrate the custom backend into the solver system:

1. **Add to implementation list**: Register the backend in the global implementations list alongside file and memory backends

2. **Configure in settings**:
```toml
[storage]
type = "redis"
redis_url = "redis://localhost:6379"
key_prefix = "solver"
```

3. **Use transparently**: Once configured, the backend is used automatically. Application code doesn't need changes - it continues using `StorageService` methods as before.

### Implementation Guidelines

When implementing a custom backend, follow these guidelines:

**Error Handling**: Map backend-specific errors to appropriate StorageError types:
- Use `Backend` for I/O and system errors
- Use `NotFound` for missing keys
- Use `Expired` for TTL-expired data
- Use `Serialization` for data format issues

**Atomicity**: Ensure operations are atomic where possible:
- Use transactions in database backends
- Implement write-then-index ordering to prevent inconsistency
- Use atomic rename patterns for file operations

**Concurrency**: The backend must support concurrent access safely:
- Multiple readers should be able to operate simultaneously
- Writes should be properly synchronized
- Use the underlying system's concurrency mechanisms (database transactions, file locks, etc.)

**Performance**: Optimize for common access patterns:
- Implement efficient batch retrieval when the backend supports it
- Use connection pooling for network backends
- Consider caching frequently accessed data

**TTL Handling**: Manage expiration appropriately:
- Use native TTL support when available (like Redis SETEX)
- Otherwise, store expiration timestamps and check on read
- Implement cleanup operations to remove expired data

**Index Cleanup**: Maintain index consistency:
- Remove deleted entries from all indexes
- Clean up empty index structures
- Ensure atomic index updates

**Configuration**: Validate early and fail fast:
- Check required parameters at startup
- Provide clear error messages for misconfiguration
- Apply sensible defaults for optional parameters
