# git-commit-to-html

A CLI tool to generate self-contained HTML diffs for git commits, making it easy to share and visualize code changes.

## Installation

### From source

```bash
git clone https://github.com/flawiddsouza/git-commit-to-html
cd git-commit-to-html
npm install -g .
```

### From npm (global)

```bash
npm install -g git-commit-to-html
```

## Usage

Generate diff for the last commit:

```bash
git-commit-to-html
```

Generate diff for a specific commit:

```bash
git-commit-to-html abc1234
```

### Run via npx (no install)

If you prefer not to install globally, you can run it directly with npx:

```bash
npx git-commit-to-html
```

Run for a specific commit hash:

```bash
npx git-commit-to-html abc1234
```

Tips:

- Pin a version for reproducibility: `npx git-commit-to-html@1`
- Works inside any git repo with commits and a clean-enough working tree.

The tool will create an HTML file named `commit-<hash>-diff.html` in the current directory, containing a side-by-side diff view of the changes.

## Static mode (no JavaScript)

Add `--static` to generate a fully static HTML file that includes the diff rendered server-side and contains no JavaScript. This is useful for strict environments or email attachments.

Examples:

```bash
# Last commit, fully static
git-commit-to-html --static

# Specific commit, fully static
git-commit-to-html abc1234 --static

# With npx
npx git-commit-to-html --static
```
