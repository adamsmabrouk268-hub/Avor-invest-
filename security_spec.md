# Firestore Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Path Variable Guard (`isValidId`)**: Every document ID (`{messageId}`, `{adminUid}`) must be a string between 1 and 128 characters matching `^[a-zA-Z0-9_\-]+$`.
2. **Strict Schema & Key Allowlisting (`isValidAdminMessage`)**:
   - Required keys on `create`: `['name', 'item', 'timestamp']`.
   - Allowed keys: `['name', 'item', 'timestamp', 'senderPhone', 'receiverPhone', 'receiverName', 'amount', 'machineTitle', 'paymentMethod', 'paymentReference', 'status', 'authorUid']`.
   - String length bounds: `name` (1..120), `item` (1..1000), `senderPhone` (3..40), `receiverPhone` (3..40), `receiverName` (1..120), `machineTitle` (1..160), `paymentMethod` (1..100), `paymentReference` (1..120), `authorUid` (1..128).
   - Temporal Integrity: `incoming().timestamp == request.time`.
3. **Admin Authorization (`isAdmin`)**:
   - Bootstrapped administrator email `adamsmabrouk268@gmail.com` with `request.auth.token.email_verified == true` OR existence in `/admins/$(request.auth.uid)`.
4. **Immutable Fields**:
   - `name`, `item`, and `timestamp` cannot be mutated after creation except by Admin status confirmation.

## 2. The "Dirty Dozen" Payloads
1. **Shadow Field Injection**: `{ "name": "Alice", "item": "AV1 Machine 1", "timestamp": "SERVER_TIMESTAMP", "isSuperAdmin": true }` -> Rejected by `hasOnly()`.
2. **Oversized Name DoW**: `{ "name": "<200-char string>", "item": "AV1", "timestamp": "SERVER_TIMESTAMP" }` -> Rejected by `name.size() <= 120`.
3. **Oversized Item DoW**: `{ "name": "Alice", "item": "<2000-char string>", "timestamp": "SERVER_TIMESTAMP" }` -> Rejected by `item.size() <= 1000`.
4. **Forged Client Timestamp**: `{ "name": "Alice", "item": "AV1", "timestamp": "2020-01-01T00:00:00Z" }` -> Rejected by `incoming().timestamp == request.time`.
5. **Missing Required Field (`item`)**: `{ "name": "Alice", "timestamp": "SERVER_TIMESTAMP" }` -> Rejected by `hasAll(['name', 'item', 'timestamp'])`.
6. **Invalid Status Enum**: `{ "name": "Alice", "item": "AV1", "timestamp": "SERVER_TIMESTAMP", "status": "HACKED" }` -> Rejected by `status in ['PENDING', 'CONFIRMED', 'SUCCESS']`.
7. **Negative Deposit Amount**: `{ "name": "Alice", "item": "AV1", "timestamp": "SERVER_TIMESTAMP", "amount": -50000 }` -> Rejected by `amount >= 0 && amount <= 1000000000`.
8. **Invalid Document ID Poisoning**: Document ID containing spaces or special characters (`msg/../../hack`) -> Rejected by `isValidId(messageId)`.
9. **Unverified Admin Email Spoof**: User with `email == "adamsmabrouk268@gmail.com"` but `email_verified == false` attempting `delete` on `/admin_messages/{id}` -> Rejected by `request.auth.token.email_verified == true`.
10. **Self-Assigned Admin Role**: Non-admin user attempting to write `/admins/{uid}` -> Rejected by `isAdmin()`.
11. **Terminal State Mutation**: Attempting to update a message after `status == 'CONFIRMED'` without admin privileges -> Rejected by terminal state lock.
12. **Type Confusion on `amount`**: `{ "name": "Alice", "item": "AV1", "timestamp": "SERVER_TIMESTAMP", "amount": "35000" }` -> Rejected by `incoming().amount is number`.
