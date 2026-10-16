export const messageContentSchema = `
ALTER TABLE messages ADD COLUMN type TEXT NOT NULL DEFAULT 'text';
ALTER TABLE messages ADD COLUMN content JSONB NOT NULL DEFAULT '{}';
ALTER TABLE schedules ADD COLUMN type TEXT NOT NULL DEFAULT 'text';
ALTER TABLE schedules ADD COLUMN content JSONB NOT NULL DEFAULT '{}';
ALTER TABLE schedules ADD COLUMN payload JSONB;
UPDATE messages SET content=jsonb_build_object('type','text','text',text);
UPDATE schedules SET content=jsonb_build_object('type','text','text',text);
ALTER TABLE messages ADD CONSTRAINT messages_type_check CHECK (type IN ('text','image','audio','voice','video','document','sticker','location','contacts','poll'));
ALTER TABLE schedules ADD CONSTRAINT schedules_type_check CHECK (type IN ('text','image','audio','voice','video','document','sticker','location','contacts','poll'));
`;
