<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ yarn install
```

## Environment variables

Copy `.env.default` to `.env` and fill in the values.

| Variable           | Required | Description                                                                 |
| ------------------ | -------- | --------------------------------------------------------------------------- |
| `MONGODB_URI`      | No       | MongoDB connection string. Defaults to `mongodb://localhost:27017/shareyourgarden`. |
| `GOOGLE_CLIENT_ID` | Yes      | OAuth 2.0 Web client ID from Google Cloud Console, used to verify Google ID tokens. |
| `JWT_SECRET`       | Yes      | Secret used to sign the backend access token (HS256). Generate with `openssl rand -base64 48`. |
| `CORS_ORIGINS`     | No       | Comma-separated list of allowed web origins. Defaults to `http://localhost:3000`. |
| `PORT`             | No       | HTTP port. Defaults to `1337`.                                              |

The app does not start if `GOOGLE_CLIENT_ID` or `JWT_SECRET` is missing.

## Authentication

- `POST /auth/google` with `{ "credential": "<Google ID token>" }` returns `{ accessToken, user }`.
- `GET /auth/me` with `Authorization: Bearer <accessToken>` returns the current user.

Access tokens are HS256 JWTs that expire after 7 days. `GET /gardens` stays public.

The user object is `{ id, email, name, picture, locale }`. `locale` is the
user's language preference: `"es"`, `"en"` or `null` (follow the
browser/system language, the default). The allowed values live in
`src/users/users.constants.ts`.

## Users

- `PATCH /users/me` with `Authorization: Bearer <accessToken>` and
  `{ "locale": "es" | "en" | null }` updates the signed-in user and returns it
  in the same shape as `GET /auth/me`. Omitted fields are left as they are;
  any other value or unknown field returns `400`.

## Gardens

`GET /gardens` is public and never includes the owner's email: `owner` is just
`{ name }`. The email is only returned to the garden's owner (`GET
/gardens/mine`, `GET /gardens/:id`, `POST` and `PATCH`). Visitors contact owners
through conversations.

## Conversations

Messaging between a garden's owner and someone interested in it. Every route
requires `Authorization: Bearer <accessToken>`. There is one conversation per
garden and requester: writing to the same garden again reuses it, and two
gardens of the same owner get separate conversations.

| Method | Route | Description |
| ------ | ----- | ----------- |
| `POST` | `/conversations` | `{ gardenId, body, productName? }`. Starts the conversation, or reuses it, and sends `body`. Returns the conversation. |
| `GET` | `/conversations` | Inbox, latest message first. Query: `role` (`all`, `received` = about my gardens, `sent`), `gardenId`, `limit` (1-50, default 20) and `before` (the `lastMessage.createdAt` of the last item, for the next page). Returns `{ conversations, hasMore }`. |
| `GET` | `/conversations/summary` | `{ unread, byGarden }`: conversations with unread messages, in total and per garden the user owns. Cheap enough to poll. |
| `GET` | `/conversations/:id` | One conversation. |
| `GET` | `/conversations/:id/messages` | `{ messages, hasMore }`, oldest first. Without cursor, the latest page. `before=<messageId>` loads older history and `after=<messageId>` polls for new messages. `limit` 1-100, default 30. |
| `POST` | `/conversations/:id/messages` | `{ body }`. Returns the message. |
| `POST` | `/conversations/:id/read` | Marks the conversation as read (`204`). |

Message bodies are trimmed and must be 1-2000 characters; `productName`, 1-60.

A conversation is returned from the authenticated user's side:

```json
{
  "id": "...",
  "gardenId": "...",
  "gardenName": "Huerta Norte",
  "productName": "Tomate",
  "role": "requester",
  "otherUser": { "id": "...", "name": "Alice", "picture": "https://..." },
  "lastMessage": { "body": "Hola", "senderId": "...", "createdAt": "..." },
  "unreadCount": 0,
  "otherLastReadAt": null,
  "createdAt": "...",
  "updatedAt": "..."
}
```

`role` is `owner` when the user owns the garden and `requester` otherwise.
`otherLastReadAt` is when the other side last read the conversation, to show
"Seen". Garden and participant names are stored when the conversation starts.

A message is `{ id, conversationId, senderId, body, createdAt }`.

## Errors

Error responses keep Nest's `statusCode`, `message` and `error` fields and add
a stable `code` that clients can translate instead of showing `message`:

```json
{
  "statusCode": 404,
  "message": "Garden not found",
  "error": "Not Found",
  "code": "GARDEN_NOT_FOUND"
}
```

| Code                        | Status | When                                              |
| --------------------------- | ------ | ------------------------------------------------- |
| `VALIDATION_FAILED`         | 400    | The body or query failed validation.              |
| `INVALID_POLYGON`           | 400    | `GET /gardens` got a malformed `polygon`.         |
| `UNAUTHORIZED`              | 401    | Missing, invalid or expired access token.         |
| `INVALID_GOOGLE_CREDENTIAL` | 401    | Google rejected the ID token.                     |
| `GOOGLE_EMAIL_NOT_VERIFIED` | 401    | The Google account's email is not verified.       |
| `FORBIDDEN`                 | 403    | Generic forbidden.                                |
| `GARDEN_NOT_OWNED`          | 403    | Editing or deleting someone else's garden.        |
| `NOT_FOUND`                 | 404    | Unknown route.                                    |
| `GARDEN_NOT_FOUND`          | 404    | No garden with that id (or hidden, when writing to it). |
| `CANNOT_CONTACT_OWN_GARDEN` | 400    | Starting a conversation about your own garden.    |
| `INVALID_MESSAGE_CURSOR`    | 400    | `before`/`after` is not a message of that conversation. |
| `CONVERSATION_NOT_FOUND`    | 404    | No conversation with that id that you take part in. |
| `GARDEN_HAS_NO_OWNER`       | 409    | Writing to a legacy garden without owner.         |
| `INTERNAL_ERROR`            | 5xx    | Unexpected server error.                          |

Throw sites name a code by passing `{ message, code }` to the Nest exception
(see `src/common/errors.ts`); otherwise `HttpExceptionFilter` derives it from
the status (for example `409` becomes `CONFLICT`).

## Compile and run the project

```bash
# development
$ yarn run start

# watch mode
$ yarn run start:dev

# production mode
$ yarn run start:prod
```

## Run tests

```bash
# unit tests
$ yarn run test

# e2e tests (the app and conversations suites need MongoDB on
# localhost:27017; set MONGODB_TEST_URI to use another one)
$ yarn run test:e2e

# test coverage
$ yarn run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ yarn install -g mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
