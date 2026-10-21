import { Sequelize } from 'sequelize';

const url = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5433/procuev';

// Local dev (docker) needs no TLS; hosted Postgres (e.g. Neon) requires SSL.
const isLocal = /@(localhost|127\.0\.0\.1|\[::1\]):/i.test(url);

export const sequelize = new Sequelize(url, {
  logging: false,
  dialect: 'postgres',
  dialectOptions: isLocal ? {} : { ssl: { require: true, rejectUnauthorized: false } },
});
