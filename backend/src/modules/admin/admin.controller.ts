import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { AdminService } from './admin.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  listUsers(@Query('page') page = 1, @Query('limit') limit = 20) {
    return this.adminService.listUsers(Number(page), Math.min(Number(limit), 100));
  }

  @Post('users/:id/ban')
  banUser(@Param('id') id: string) {
    return this.adminService.banUser(id);
  }

  @Get('pending-approval')
  pending() {
    return this.adminService.pendingApprovals();
  }

  @Post('transactions/:id/approve')
  approve(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body('approve') approve: boolean,
  ) {
    return this.adminService.approveTransaction(id, approve !== false, admin.userId);
  }

  @Get('analytics/overview')
  analytics() {
    return this.adminService.analytics();
  }
}
