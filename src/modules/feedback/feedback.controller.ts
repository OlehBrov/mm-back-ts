import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  @HttpCode(200)
  async submit(@Body() dto: SubmitFeedbackDto) {
    await this.feedbackService.submitFeedback(dto.rating);
    return { ok: true };
  }
}
