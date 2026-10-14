# Security policy

Floppy holds people's work plans, chat and organization data, so we take security reports seriously and thank everyone who reports responsibly.

## Supported versions

Floppy is released from the `main` branch. Security fixes go into `main`; older commits and forks are not patched.

| Version | Supported |
| --- | --- |
| `main` (latest) | Yes |
| Anything older | No |

## Reporting a vulnerability

**Please do not report security problems in public issues, discussions or pull requests.**

Report them privately through GitHub:

1. Go to the repository's **Security** tab.
2. Choose **Report a vulnerability**, or open [github.com/Tharinda-Pamindu/Floppy/security/advisories/new](https://github.com/Tharinda-Pamindu/Floppy/security/advisories/new).

Only the maintainers can see the report. Please include:

- what the problem is and what an attacker could do with it;
- the steps, requests or code to reproduce it;
- the affected area (API route, page, workflow) and the commit you tested;
- any ideas you have for a fix.

## What happens next

- We acknowledge your report within **7 days**.
- We confirm whether it's a vulnerability and how severe it is, and keep you updated while we work on a fix.
- We publish a security advisory once a fix is out, and credit you unless you'd rather stay anonymous.

Please give us a reasonable time to fix the problem before you disclose it anywhere else.

## Scope

In scope: this repository's code, meaning the API (`apps/api`), the web app (`apps/web`) and the shared package (`packages/shared`). We're especially interested in:

- one organization reaching another organization's data (tenancy);
- getting around roles: member, team lead, admin, owner, staff or super admin;
- authentication or session problems, webhook signature checks;
- injection (SQL, HTML in emails, markdown pages), XSS, CSRF;
- secrets or private content leaking into logs, emails or staff views.

Out of scope:

- problems in third-party services themselves (Clerk, Supabase, Novu, Resend, Twilio, GitHub, the AI provider): please report those to the vendor;
- your own deployment's configuration, such as weak env secrets or a missing webhook secret;
- denial of service by sheer volume, spam, and social engineering;
- reports from automated scanners with no demonstrated impact.

## Safe harbour

We won't take legal action against research done in good faith that follows this policy: only test against your own deployment and your own accounts, don't access or change other people's data, don't degrade the service for others, and give us time to fix the problem before disclosure.

## How Floppy is protected

[docs/SECURITY.md](docs/SECURITY.md) describes the security design: tenancy checks, Row Level Security, authentication through Clerk, webhook verification, content security policy and secret handling.
