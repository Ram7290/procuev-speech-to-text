import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../db.js';

// One row = one finalized sentence from the live page, or a manually created entry.
export class Transcript extends Model {}

Transcript.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    text: { type: DataTypes.TEXT, allowNull: false },
    language: { type: DataTypes.STRING(16), allowNull: true },
    durationMs: { type: DataTypes.INTEGER, allowNull: true, field: 'duration_ms' },
    source: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'live' },
  },
  {
    sequelize,
    modelName: 'Transcript',
    tableName: 'transcripts',
    underscored: true, // created_at / updated_at columns
  }
);
