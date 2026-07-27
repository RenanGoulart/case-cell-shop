import type {
  FinishProcessingAttemptInput,
  FinishProcessingAttemptResult,
  ProcessingRepository,
} from "../ports/processing-ports.js";

export class FinishProcessingAttemptUseCase {
  public constructor(
    private readonly repository: Pick<ProcessingRepository, "finishProcessingAttempt">,
  ) {}

  public execute(input: FinishProcessingAttemptInput): Promise<FinishProcessingAttemptResult> {
    return this.repository.finishProcessingAttempt(input);
  }
}
