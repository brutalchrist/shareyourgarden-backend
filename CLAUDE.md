# Agent instructions

## Commits and pull requests

Commit messages and pull request titles follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`. Pull requests are squash-merged, so the title becomes the commit on `main`.

- **Types**: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `style`, `build`, `ci`, `chore`.
- **Scope** (optional): the area changed, such as `gardens`, `conversations`, `push`, `uploads` or `auth`.
- **Summary**: imperative, lowercase, no final period, e.g. `feat(push): send Web Push notifications for new messages`.
- Breaking changes add `!` after the type or scope and a `BREAKING CHANGE:` footer.
