# authorization.confused-deputy.v1

## Task concept
A service that performs actions on behalf of users (delegation / "act-as") must
prevent the confused-deputy problem: the deputy's own ambient privileges must
never satisfy a request the delegating principal lacks rights for. Effective
authority is the intersection of the parties, and a delegation chain may only
narrow authority.

## Public contract
- `POST /act-as {principal, action, resource}` with a delegation token; the
  service performs the action under least privilege.
- Normal authenticated endpoints for direct access.

## Hidden edge cases
- Effective permission = `caller scopes ∩ delegated authority ∩ resource policy`
  — never the deputy/service's ambient privileges.
- A low-privilege principal cannot escalate by routing a request through the deputy.
- Delegation chain A→B→C: authority only narrows; C cannot exceed A.
- Revoked or expired delegation → `403`.
- Resource ownership still enforced under delegation.
- Audit attributes the action to both deputy and principal.

## Why Claude might fail
- Performs the action with the service account's privileges (the classic confused
  deputy); unions scopes instead of intersecting; chain widens authority.

## Why GPT-5 might fail
- Intersects caller + target but forgets the resource policy, or fails to narrow
  along a chain, or mishandles revocation timing; ambient creds leak on one path.

## Why a small model might fail
- No delegation model; performs the action with whatever token is present →
  escalation.

## Expected failure modes
- Privilege escalation; unauthorized actions succeeding; missing/incorrect audit
  attribution.

## Benchmark gaming vectors
- Deny everything (passes negative tests, fails legitimate-delegation tests).
- Check only the caller, not the full chain.
- Detect the privileged test identities.

## Capability tested
- Authorization reasoning; least-privilege delegation; scope intersection;
  chain-of-authority narrowing.

## Difficulty
5/5 — subtle privilege-composition reasoning resistant to escalation.
