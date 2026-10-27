import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoredImage } from './stored-image.entity';
import { StoredImagesController } from './stored-images.controller';
import { StoredImagesService } from './stored-images.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([StoredImage])],
  controllers: [StoredImagesController],
  providers: [StoredImagesService],
  exports: [StoredImagesService],
})
export class StoredImagesModule {}
