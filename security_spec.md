# Firestore Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Path Variable Guard (`isValidId`)**: Every document ID (`{orderId}`, `{messageId}`, `{adminUid}`) must be a string between 1 and 128 characters matching `^[a-zA-Z0-9_\-]+$`.
2. **Strict Schema & Key Allowlisting for Orders (`isValidOrder`)**:
   - Required keys on `create`: `['customername', 'name', 'status', 'timestamp']`.
   - Allowed keys: `['customername', 'name', 'status', 'timestamp', 'id', 'user_id', 'customer_name', 'customer_phone', 'machine_id', 'machine_title', 'amount_invested', 'amount', 'daily_return', 'duration_days', 'total_return', 'days_elapsed', 'days_left', 'units', 'start_date', 'end_date', 'purchase_date', 'ending_date', 'payment_method', 'payment_reference', 'authorUid', 'updated_at']`.
   - Valid `status` values: `['pending', 'confirmed', 'ACTIVE & DELIVERED', 'denied', 'PENDING', 'ACTIVE', 'COMPLETED', 'PAYOUT_COMPLETE']`.
   - Temporal Integrity: `incoming().timestamp == request.time` on `create`, and `incoming().timestamp == existing().timestamp` on `update`.
3. **Strict Schema & Key Allowlisting for Admin Messages (`isValidAdminMessage`)**:
   - Required keys on `create`: `['name', 'item', 'timestamp', 'status']`.
   - Allowed keys: `['name', 'item', 'timestamp', 'senderPhone', 'receiverPhone', 'receiverName', 'amount', 'machineTitle', 'paymentMethod', 'paymentReference', 'status', 'authorUid', 'userId', 'transactionId']`.
4. **Admin Authorization (`isAdmin`)**:
   - Bootstrapped administrator email `adamsmabrouk268@gmail.com` with `request.auth.token.email_verified == true` OR existence in `/admins/$(request.auth.uid)`.
5. **Immutable Order Identity Fields**:
   - `customername`, `name`, and `timestamp` cannot be mutated after creation during status transitions (`pending` -> `confirmed` -> `ACTIVE & DELIVERED` or `denied`).

## 2. The "Dirty Dozen" Payloads
1. **Shadow Field Injection on `/orders`**: `{ "customername": "Alice", "name": "AV1 Machine 1", "status": "pending", "timestamp": "SERVER_TIMESTAMP", "isSuperAdmin": true }` -> Rejected by `hasOnly()`.
2. **Oversized `customername` DoW**: `{ "customername": "<200-char string>", "name": "AV1", "status": "pending", "timestamp": "SERVER_TIMESTAMP" }` -> Rejected by `customername.size() <= 160`.
3. **Oversized `name` DoW**: `{ "customername": "Alice", "name": "<300-char string>", "status": "pending", "timestamp": "SERVER_TIMESTAMP" }` -> Rejected by `name.size() <= 200`.
4. **Forged Client Timestamp on `/orders`**: `{ "customername": "Alice", "name": "AV1", "status": "pending", "timestamp": "2020-01-01T00:00:00Z" }` -> Rejected by `incoming().timestamp == request.time`.
5. **Missing Required Field (`customername`)**: `{ "name": "AV1", "status": "pending", "timestamp": "SERVER_TIMESTAMP" }` -> Rejected by `hasAll(['customername', 'name', 'status', 'timestamp'])`.
6. **Invalid Order Status Enum**: `{ "customername": "Alice", "name": "AV1", "status": "HACKED", "timestamp": "SERVER_TIMESTAMP" }` -> Rejected by `status in [...]`.
7. **Negative Order Amount**: `{ "customername": "Alice", "name": "AV1", "status": "pending", "timestamp": "SERVER_TIMESTAMP", "amount_invested": -50000 }` -> Rejected by `amount_invested >= 0 && amount_invested <= 1000000000`.
8. **Invalid Document ID Poisoning**: Document ID containing spaces or special characters (`ord/../../hack`) -> Rejected by `isValidId(orderId)`.
9. **Unverified Admin Email Spoof**: User with `email == "adamsmabrouk268@gmail.com"` but `email_verified == false` attempting `/admins/{uid}` write -> Rejected by `request.auth.token.email_verified == true`.
10. **Self-Assigned Admin Role**: Non-admin user attempting to write `/admins/{uid}` -> Rejected by `isAdmin()`.
11. **Mutating `customername` During Status Update**: Attempting to change `customername` while updating `status` to `"confirmed"` -> Rejected by `incoming().customername == existing().customername`.
12. **Type Confusion on `amount_invested`**: `{ "customername": "Alice", "name": "AV1", "status": "pending", "timestamp": "SERVER_TIMESTAMP", "amount_invested": "35000" }` -> Rejected by `data.amount_invested is number`.
