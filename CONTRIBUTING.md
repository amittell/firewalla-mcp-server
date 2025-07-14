# Contributing to Firewalla MCP Server

We welcome contributions! This project follows the philosophy of "elegance over complexity, no bloat."

## Quick Start

- **Clone → Run tests → Submit PR** (three simple steps)
- **We merge fast; keep PRs <300 lines; larger PRs require an issue first**
- **Make sure tests pass locally before submitting** (`npm test`)

## Development Setup

```bash
git clone https://github.com/amittell/firewalla-mcp-server.git
cd firewalla-mcp-server
npm install
npm run build
npm test
```

## Environment Setup

Create `.env` file with your Firewalla credentials:
```env
FIREWALLA_MSP_TOKEN=your_msp_access_token_here
FIREWALLA_MSP_ID=yourdomain.firewalla.net  
FIREWALLA_BOX_ID=your_box_gid_here
```

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run lint          # Code quality
npm run typecheck     # TypeScript validation
```

## Pull Request Guidelines

1. **Keep it simple** - Follow the project's elegance-over-complexity philosophy
2. **Test coverage** - New features should include tests
3. **Documentation** - Update relevant docs if needed
4. **One feature per PR** - Makes review and merge faster
5. **Descriptive commits** - Clear, concise commit messages

## Code Style

- TypeScript-first development
- ESLint + Prettier for formatting
- Comprehensive error handling
- Professional logging patterns
- Performance-conscious implementations

## Getting Help

- Check existing issues before creating new ones
- For API-related questions, consult `/docs/firewalla-api-reference.md`
- For search syntax, see `/docs/query-syntax-guide.md`

## What We're Looking For

- Bug fixes and performance improvements
- Enhanced search capabilities
- Better error handling
- Documentation improvements
- Real-world usage examples

## What We Avoid

- Over-engineering solutions
- Unnecessary dependencies
- Complex abstractions without clear benefit
- Breaking changes without migration path

---

**Remember**: Simple, elegant code that solves real problems is preferred over complex, theoretical solutions.