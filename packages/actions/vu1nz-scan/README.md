# vu1nz Security Scan

Installs a GitHub Actions workflow that reviews pull requests for security vulnerabilities with vu1nz.

The target repository must provide an `ENV_FILE` secret containing `ANTHROPIC_API_KEY`.

## Output

`vu1nz-scan` writes `.github/workflows/vu1nz-scan.yml` through a pull request.
