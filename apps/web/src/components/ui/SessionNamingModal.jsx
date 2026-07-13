import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Save, Sparkles } from 'lucide-react';

export default function SessionNamingModal({ 
  isOpen, 
  onClose, 
  onSave, 
  defaultName = '',
  suggestedNames = []
}) {
  const [sessionName, setSessionName] = useState(defaultName);

  const handleSave = () => {
    onSave(sessionName);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-white dark:bg-[#1a1a24] border-zinc-200 dark:border-white/10 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Save className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
            Name Your Session
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 mt-4">
          <div>
            <Label className="text-zinc-800 dark:text-zinc-300 mb-2 block">Session Name</Label>
            <Input
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="e.g., Leadership Essay – Confident Tone"
              className="bg-zinc-50 dark:bg-[#13131a] border-zinc-300 dark:border-white/10 text-zinc-900 dark:text-zinc-100"
              autoFocus
            />
          </div>

          {suggestedNames.length > 0 && (
            <div>
              <Label className="text-zinc-600 dark:text-zinc-400 text-xs mb-2 block flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Suggested Names
              </Label>
              <div className="flex flex-wrap gap-2">
                {suggestedNames.map((name, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSessionName(name)}
                    className="text-xs px-3 py-1 rounded-full bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-white/10 transition-colors"
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1 border-zinc-300 dark:border-white/10 text-zinc-700 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!sessionName.trim()}
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Save className="w-4 h-4 mr-2" />
              Save Session
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
