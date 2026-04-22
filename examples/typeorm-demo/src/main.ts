import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { CrudConfigService } from '@nestjs-crud/core';
import { USER_REQUEST_KEY } from './constants';

// Load crud config BEFORE AppModule is imported.
CrudConfigService.load({
  auth: {
    property: USER_REQUEST_KEY,
  },
});

// eslint-disable-next-line import/first
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ transform: true }));

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`typeorm-demo listening on http://localhost:${port}`);
}

bootstrap();
