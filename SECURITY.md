# Security Policy

## Supported Versions

We provide security fixes for:
- The latest code on `main`
- The most recent release, if releases are being cut

For public or shared deployments, configure `PLAYGROUND_AUTH_PASSWORD` and
`PLAYGROUND_AUTH_SECRET`. In `NODE_ENV=production`, the app now fails closed by
default unless `PLAYGROUND_ALLOW_UNAUTHENTICATED=true` is set intentionally.

Older versions may not receive security updates.

## Reporting a Vulnerability

Please do not open public GitHub issues for suspected security vulnerabilities.

If this repository has GitHub private vulnerability reporting enabled, use that.
Otherwise, contact: security@ibm.com

Please include:
- A description of the issue
- Steps to reproduce
- Impact assessment
- Any suggested fix or mitigation

We will aim to acknowledge reports within 3 business days and share next steps after triage.

## Disclosure

Please allow us time to investigate and fix the issue before public disclosure.
