# 2026-09-03 Signup Rate Limit Permission Incident

## 症状

ログイン画面の新規アカウント作成で、入力Validationと作成キー入力後に `サーバー処理に失敗しました` が表示され、アカウントを作成できなかった。

## Evidence

Supabase Edge Function logでは `lyrictube-api` の `register_account` 呼び出しがHTTP 500になっていた。

同時刻のPostgres logでは次を確認した。

```text
permission denied for table lyrictube_login_rate_limits
```

`lyrictube_register_account` RPC自体はTransaction内の診断呼び出しで正常に成功したため、アカウント作成本体ではなく、作成キー試行回数を管理するRate Limit処理の権限不足と特定した。

## Root Cause

`lyrictube_login_rate_limits` はRLS有効化済みだったが、Edge Functionが使用する `service_role` に `SELECT / INSERT / UPDATE / DELETE` のTable Grantが付与されていなかった。

RLSの有無だけを確認し、実際にEdge Functionが必要とするDatabase Grantを本番Roleで検証していなかった。

## Fix

Supabase productionへMigration `grant_signup_rate_limit_service_role` を適用し、次の権限を付与した。

```sql
grant select, insert, update, delete
on table public.lyrictube_login_rate_limits
 to service_role;
```

Migration version: `20260903021652`

Frontend、作成キー、Session仕様、Data Schemaは変更していない。

## Validation

- `service_role` のTable Grantに `SELECT / INSERT / UPDATE / DELETE` が存在することを確認。
- Transaction内で `set local role service_role` を行い、Rate Limit Tableへの `SELECT / UPSERT / DELETE` が成功することを確認してRollbackした。
- `lyrictube_register_account` RPCをTransaction内で診断実行し、正常にUUIDを返すことを確認してRollbackした。
- 外部ネットワーク制約により、この作業環境から本番Edge FunctionへのHTTP E2E登録テストは実施できていない。ユーザー環境からの再試行で最終確認する。

## Prevention

Supabaseで新しいTableをEdge Functionから使う場合は、RLSだけでなく次をセットで確認する。

1. 実際に使うRoleのTable Grant。
2. RLS / Policyの状態。
3. Edge Functionが実行するCRUDの全種類。
4. 本番Role相当でのTransaction内Permission test。
5. Generic 500だけでなくPostgres / Edge Function logを照合する。
