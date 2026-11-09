# Firestore Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Path Variable Guard (`isValidId`)**: Every document ID (`{orderId}`, `{withdrawalId}`, `{messageId}`, `{adminUid}`) must be a string between 1 and 128 characters matching `^[a-zA-Z0-9_\-]+$`.
2. **Strict Schema & Key Allowlisting for Orders (`isValidOrder`)**:
   - Required keys on `create`: `['customername', 'name', 'status', 'timestamp']`.
   - Allowed keys: `['customername', 'name', 'status', 'timestamp', 'id', 'user_id', 'customer_name', 'customer_phone', 'machine_id', 'machine_title', 'amount_invested', 'amount', 'daily_return', 'duration_days', 'total_return', 'days_elapsed', 'days_left', 'units', 'start_date', 'end_date', 'purchase_date', 'ending_date', 'payment_method', 'payment_reference', 'authorUid', 'updated_at']`.
   - Valid `status` values: `['pending', 'confirmed', 'ACTIVE & DELIVERED', 'denied', 'PENDING', 'ACTIVE', 'COMPLETED', 'PAYOUT_COMPLETE']`.
   - Temporal Integrity: `incoming().timestamp == request.time` on `create`, and `incoming().timestamp == existing().timestamp` on `update`.
3. **Strict Schema & Key Allowlisting for Withdrawals (`isValidWithdrawal`)**:
   - Required keys on `create`: `['userId', 'name', 'phone', 'amount', 'status', 'createdAt']`.
   - Allowed keys: `['userId', 'name', 'phone', 'amount', 'status', 'createdAt', 'id', 'fee_amount', 'net_amount', 'payment_method', 'payment_reference', 'account_name', 'updated_at', 'authorUid']`.
   - Valid `status` values: `['pending', 'approved', 'rejected', 'PENDING', 'SUCCESS', 'FAILED', 'CONFIRMED', 'REJECTED']`.
   - Temporal Integrity: `incoming().createdAt == request.time` on `create`, and `incoming().createdAt == existing().createdAt` on `update`.
   - Immutable Identity Fields on `update`: `userId`, `name`, `phone`, `amount`, and `createdAt` cannot be mutated during status transitions (`pending` -> `approved` or `rejected`).
4. **Strict Schema & Key Allowlisting for Admin Messages (`isValidAdminMessage`)**:
   - Required keys on `create`: `['name', 'item', 'timestamp', 'status']`.
   - Allowed keys: `['name', 'item', 'timestamp', 'senderPhone', 'receiverPhone', 'receiverName', 'amount', 'machineTitle', 'paymentMethod', 'paymentReference', 'status', 'authorUid', 'userId', 'transactionId']`.
5. **Admin Authorization (`isAdmin`)**:
   - Bootstrapped administrator email `adamsmabrouk268@gmail.com` with `request.auth.token.email_verified == true` OR existence in `/admins/$(request.auth.uid)`.

## 2. The "Dirty Dozen" Payloads
1. **Shadow Field Injection on `/withdrawals`**: `{ "userId": "u1", "name": "Alice", "phone": "0700000000", "amount": 5000, "status": "pending", "createdAt": "SERVER_TIMESTAMP", "isSuperAdmin": true }` -> Rejected by `hasOnly()`.
2. **Oversized `name` DoW on `/withdrawals`**: `{ "userId": "u1", "name": "<200-char string>", "phone": "0700000000", "amount": 5000, "status": "pending", "createdAt": "SERVER_TIMESTAMP" }` -> Rejected by `name.size() <= 160`.
3. **Oversized `phone` DoW on `/withdrawals`**: `{ "userId": "u1", "name": "Alice", "phone": "<60-char string>", "amount": 5000, "status": "pending", "createdAt": "SERVER_TIMESTAMP" }` -> Rejected by `phone.size() <= 40`.
4. **Forged Client Timestamp on `/withdrawals`**: `{ "userId": "u1", "name": "Alice", "phone": "0700000000", "amount": 5000, "status": "pending", "createdAt": "2020-01-01T00:00:00Z" }` -> Rejected by `incoming().createdAt == request.time`.
5. **Missing Required Field (`phone`) on `/withdrawals`**: `{ "userId": "u1", "name": "Alice", "amount": 5000, "status": "pending", "createdAt": "SERVER_TIMESTAMP" }` -> Rejected by `hasAll(['userId', 'name', 'phone', 'amount', 'status', 'createdAt'])`.
6. **Invalid Withdrawal Status Enum**: `{ "userId": "u1", "name": "Alice", "phone": "0700000000", "amount": 5000, "status": "HACKED", "createdAt": "SERVER_TIMESTAMP" }` -> Rejected by `status in [...]`.
7. **Negative Withdrawal Amount**: `{ "userId": "u1", "name": "Alice", "phone": "0700000000", "amount": -5000, "status": "pending", "createdAt": "SERVER_TIMESTAMP" }` -> Rejected by `amount >= 0 && amount <= 1000000000`.
8. **Invalid Document ID Poisoning**: Document ID containing spaces or special characters (`wdr/../../hack`) -> Rejected by `isValidId(withdrawalId)`.
9. **Unverified Admin Email Spoof**: User with `email == "adamsmabrouk268@gmail.com"` but `email_verified == false` attempting `/admins/{uid}` write -> Rejected by `request.auth.token.email_verified == true`.
10. **Self-Assigned Admin Role**: Non-admin user attempting to write `/admins/{uid}` -> Rejected by `isAdmin()`.
11. **Mutating `amount` or `phone` During Status Update on `/withdrawals`**: Attempting to change `amount` while updating `status` to `"approved"` -> Rejected by `incoming().amount == existing().amount` and `affectedKeys().hasOnly(['status', 'updated_at'])`.
12. **Type Confusion on `amount`**: `{ "userId": "u1", "name": "Alice", "phone": "0700000000", "amount": "5000", "status": "pending", "createdAt": "SERVER_TIMESTAMP" }` -> Rejected by `data.amount is number`.
