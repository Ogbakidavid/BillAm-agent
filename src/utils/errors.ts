/**
 * errors.ts
 * Centralized Application Error Classes for BillAm Agent
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode = 500,
    errorCode = "INTERNAL_ERROR",
    isOperational = true,
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 404 Not Found (e.g. Job or Quote not found)
 */

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404, "NOT_FOUND");
  }
}

/**
 * 400 Validation Error (e.g. invalid request body or route input)
 */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, "VALIDATION_ERROR");
  }
}

/**
 * 400 State Machine Transition Error (e.g. CLARIFYING -> EXECUTED attempt)
 */

export class StateTransitionError extends AppError {
  constructor(fromState: string, toState: string) {
    super(
      `Invalid state transition from '${fromState}' to '${toState}'`,
      400,
      "INVALID_STATE_TRANSITION",
    );
  }
}

/**
 * 403 Approval Bypass Security Error (e.g. client trying to trigger quote send)
 */

export class ApprovalBypassError extends AppError {
  constructor(message = "Quote sending requires explicit SME owner approval") {
    super(message, 403, "APPROVAL_REQUIRED");
  }
}

/**
 * 422 / 500 Tool Execution Failure
 */

export class ToolExecutionError extends AppError {
  constructor(toolName: string, details: string) {
    super(
      `Tool '${toolName}' failed ${details}`, 
      500, 
      "TOOL_EXECUTION_ERROR"
    );
  }
}

/**
 * 502 / 503 LLM Provider Failure (Bedrock / Anthropic)
 */ export class LLMProviderError extends AppError {
  constructor(provider: string, message: string) {
    super(
      `LLM Provider '${provider}' error: ${message}`,
      502,
      "LLM_PROVIDER_ERROR",
    );
  }
}
