import { useState } from 'react';
import { defaultManuscript, mockVersions, type ManuscriptContent, type ManuscriptVersion } from '@/lib/mock-data';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Save, History, ChevronRight } from 'lucide-react';

const sections: { key: keyof ManuscriptContent; label: string }[] = [
  { key: 'abstract', label: 'Abstract' },
  { key: 'introduction', label: 'Introduction' },
  { key: 'methodology', label: 'Methodology' },
  { key: 'results', label: 'Results' },
];

export default function ManuscriptEditor() {
  const [content, setContent] = useState<ManuscriptContent>(defaultManuscript);
  const [versions, setVersions] = useState<ManuscriptVersion[]>(mockVersions);
  const [showHistory, setShowHistory] = useState(false);
  const [activeSection, setActiveSection] = useState<keyof ManuscriptContent>('abstract');

  const handleSave = () => {
    const v: ManuscriptVersion = {
      id: `v${versions.length + 1}`,
      timestamp: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      label: 'Manual save',
      content: { ...content },
    };
    setVersions([v, ...versions]);
  };

  const loadVersion = (v: ManuscriptVersion) => {
    setContent({ ...v.content });
    setShowHistory(false);
  };

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col">
        {/* Section tabs */}
        <div className="flex items-center gap-1 border-b px-4 py-2 bg-card overflow-x-auto">
          {sections.map(s => (
            <button
              key={s.key}
              onClick={() => setActiveSection(s.key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                activeSection === s.key
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {s.label}
            </button>
          ))}
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => setShowHistory(!showHistory)}>
            <History className="w-3.5 h-3.5 mr-1.5" /> History
          </Button>
          <Button size="sm" onClick={handleSave}>
            <Save className="w-3.5 h-3.5 mr-1.5" /> Save Version
          </Button>
        </div>

        {/* Editor */}
        <div className="flex-1 p-6 overflow-auto">
          <h2 className="font-display text-xl font-semibold text-foreground mb-3 capitalize">{activeSection}</h2>
          <Textarea
            value={content[activeSection]}
            onChange={e => setContent({ ...content, [activeSection]: e.target.value })}
            className="min-h-[300px] resize-none text-sm leading-relaxed border-none shadow-none focus-visible:ring-0 p-0 bg-transparent"
            placeholder={`Write your ${activeSection} here...`}
          />
        </div>
      </div>

      {/* Version history panel */}
      {showHistory && (
        <div className="w-72 border-l bg-card p-4 overflow-auto">
          <h3 className="font-display font-semibold text-foreground mb-4">Version History</h3>
          <div className="space-y-2">
            {versions.map(v => (
              <button
                key={v.id}
                onClick={() => loadVersion(v)}
                className="w-full text-left p-3 rounded-lg border hover:bg-muted/50 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-primary">{v.id.toUpperCase()}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <p className="text-sm font-medium text-foreground mt-1">{v.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{v.timestamp}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
