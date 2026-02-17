import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TypeOrmCrudService } from '../../../packages/typeorm/src';

import { Note } from './note.entity';

@Injectable()
export class NotesService extends TypeOrmCrudService<Note> {
  constructor(@InjectRepository(Note) repo) {
    super(repo);
  }
}
