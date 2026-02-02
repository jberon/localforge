import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ThumbsUp, ThumbsDown, MessageSquare, X, Loader2 } from "lucide-react";
import { submitFeedback } from "@/lib/analytics";
import { useToast } from "@/hooks/use-toast";

interface FeedbackPanelProps {
  projectId: string;
  prompt: string;
  generatedCode?: string;
  templateUsed?: string;
  onClose?: () => void;
}

export function FeedbackPanel({ 
  projectId, 
  prompt, 
  generatedCode, 
  templateUsed,
  onClose 
}: FeedbackPanelProps) {
  const [rating, setRating] = useState<"positive" | "negative" | null>(null);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (selectedRating: "positive" | "negative") => {
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    setRating(selectedRating);

    const result = await submitFeedback({
      projectId,
      rating: selectedRating,
      comment: comment || undefined,
      prompt,
      generatedCode,
      templateUsed,
    });

    setIsSubmitting(false);

    if (result) {
      setSubmitted(true);
      toast({
        title: "Thanks for your feedback!",
        description: "Your feedback helps improve future generations.",
      });
    } else {
      toast({
        title: "Failed to submit feedback",
        description: "Please try again later.",
        variant: "destructive",
      });
    }
  };

  if (submitted) {
    return (
      <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-md text-sm text-muted-foreground">
        <ThumbsUp className="h-4 w-4 text-green-500" />
        <span>Thanks for your feedback!</span>
      </div>
    );
  }

  return (
    <div className="p-3 bg-muted/30 rounded-md border">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">How was this generation?</span>
        {onClose && (
          <Button 
            size="icon" 
            variant="ghost" 
            className="h-6 w-6"
            onClick={onClose}
            data-testid="button-close-feedback"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
      
      <div className="flex items-center gap-2 mb-2">
        <Button
          size="sm"
          variant={rating === "positive" ? "default" : "outline"}
          onClick={() => {
            if (!showComment) {
              handleSubmit("positive");
            } else {
              setRating("positive");
            }
          }}
          disabled={isSubmitting}
          data-testid="button-feedback-positive"
        >
          {isSubmitting && rating === "positive" ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <ThumbsUp className="h-4 w-4 mr-1" />
          )}
          Good
        </Button>
        
        <Button
          size="sm"
          variant={rating === "negative" ? "default" : "outline"}
          onClick={() => {
            if (!showComment) {
              handleSubmit("negative");
            } else {
              setRating("negative");
            }
          }}
          disabled={isSubmitting}
          data-testid="button-feedback-negative"
        >
          {isSubmitting && rating === "negative" ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <ThumbsDown className="h-4 w-4 mr-1" />
          )}
          Needs work
        </Button>
        
        {!showComment && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowComment(true)}
            data-testid="button-add-comment"
          >
            <MessageSquare className="h-4 w-4 mr-1" />
            Add comment
          </Button>
        )}
      </div>

      {showComment && (
        <div className="space-y-2">
          <Textarea
            placeholder="What could be improved? (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="min-h-[60px] text-sm"
            data-testid="textarea-feedback-comment"
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowComment(false)}
              data-testid="button-cancel-comment"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => rating && handleSubmit(rating)}
              disabled={!rating || isSubmitting}
              data-testid="button-submit-feedback"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : null}
              Submit
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
