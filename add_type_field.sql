-- Ajout de la colonne physique dans la table articles
ALTER TABLE articles ADD COLUMN type VARCHAR(255);

-- Ajout des métadonnées dans directus_fields
INSERT INTO directus_fields (
  collection, field, special, interface, options, display, display_options,
  readonly, hidden, sort, width, translations, note, conditions, required, "group", validation, validation_message
) VALUES (
  'articles',
  'type',
  NULL,
  'select-dropdown',
  '{"choices":[{"text":"Principal","value":"Principal"},{"text":"Secondaire","value":"secondaire"}]}',
  'labels',
  '{"choices":[{"value":"Principal","text":"Principal","foreground":"var(--theme--primary)","background":"var(--theme--primary-background)"},{"value":"secondaire","text":"Secondaire","foreground":"var(--theme--foreground)","background":"var(--theme--background-normal)"}],"showAsDot":false}',
  0,
  0,
  17,
  'full',
  NULL,
  NULL,
  NULL,
  0,
  NULL,
  NULL,
  NULL
);
