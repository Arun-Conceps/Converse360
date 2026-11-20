import { Global, Module } from '@nestjs/common';
import { RateLimitModule } from '../common/rate-limit/rate-limit.module';
import { ApiKeyGuard } from './guards/api-key.guard';
import { SupabaseAuthGuard } from './guards/supabase-auth.guard';
import { QrLoginController } from './qr-login/qr-login.controller';
import { QrLoginService } from './qr-login/qr-login.service';

@Global()
@Module({
  imports: [RateLimitModule],
  controllers: [QrLoginController],
  providers: [ApiKeyGuard, SupabaseAuthGuard, QrLoginService],
  exports: [ApiKeyGuard, SupabaseAuthGuard],
})
export class AuthModule {}
