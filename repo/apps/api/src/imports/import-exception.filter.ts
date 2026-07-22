import { ExceptionFilter, Catch, ArgumentsHost, BadRequestException, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { ImportBusinessException, StructuredErrorResponse } from '../imports/import.exception';

@Catch(ImportBusinessException)
export class ImportExceptionFilter implements ExceptionFilter {
  catch(exception: ImportBusinessException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const payload = exception.getResponse() as StructuredErrorResponse;
    response.status(400).json(payload);
  }
}

@Catch(BadRequestException, NotFoundException)
export class ValidationExceptionFilter implements ExceptionFilter {
  catch(exception: BadRequestException | NotFoundException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const payload = exception.getResponse();
    const code = exception instanceof NotFoundException ? 'NOT_FOUND' : 'BAD_REQUEST';
    if (typeof payload === 'object' && payload !== null && 'code' in payload) {
      response.status(400).json(payload);
      return;
    }
    const message = Array.isArray(payload) ? payload.join(', ')
      : typeof payload === 'string' ? payload
      : typeof payload === 'object' && payload !== null && 'message' in payload ? String((payload as Record<string, unknown>).message)
      : 'Request failed';
    response.status(400).json({ code, message });
  }
}
