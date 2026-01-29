import React from 'react';
import Icon from '../../../components/AppIcon';

const TranslationTreeView = ({
  grouped,
  expandedCategories,
  onToggleCategory,
  onEdit,
  onDelete
}) => {
  // Empty state
  if (Object.keys(grouped).length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-12 text-center">
        <Icon name="FileText" size={48} className="mx-auto mb-3 text-muted-foreground" />
        <p className="text-lg font-medium text-foreground">No translations to display</p>
        <p className="text-sm text-muted-foreground mt-1">
          Start by adding a new translation key
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden max-h-[600px] overflow-y-auto">
      {Object.keys(grouped)
        .sort()
        .map((category) => {
          const isExpanded = expandedCategories.has(category);
          const items = grouped[category];

          return (
            <div key={category}>
              {/* Category header */}
              <div className="border-b border-border bg-muted/30 sticky top-0 z-10">
                <button
                  onClick={() => onToggleCategory(category)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
                >
                  <Icon
                    name={isExpanded ? 'ChevronDown' : 'ChevronRight'}
                    size={16}
                    className="text-muted-foreground"
                  />
                  <Icon name="Folder" size={16} className="text-accent" />
                  <span className="font-semibold text-foreground">{category}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-muted border border-border text-muted-foreground">
                    {items.length}
                  </span>
                </button>
              </div>

              {/* Category items (if expanded) */}
              {isExpanded &&
                items
                  .sort((a, b) => a.key.localeCompare(b.key))
                  .map((item) => (
                    <div
                      key={item.key}
                      className="border-b border-border hover:bg-accent/5 transition-colors"
                    >
                      <div className="flex items-center gap-3 px-8 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-mono text-foreground truncate font-medium">
                            {item.key}
                          </p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {item.value || <span className="italic">(empty value)</span>}
                          </p>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => onEdit(item.key)}
                            className="p-2 hover:bg-primary/10 rounded transition-colors group"
                            title="Edit translation"
                          >
                            <Icon
                              name="Pencil"
                              size={14}
                              className="text-muted-foreground group-hover:text-primary"
                            />
                          </button>

                          <button
                            onClick={() => onDelete(item.key)}
                            className="p-2 hover:bg-error/10 rounded transition-colors group"
                            title="Delete translation"
                          >
                            <Icon
                              name="Trash2"
                              size={14}
                              className="text-muted-foreground group-hover:text-error"
                            />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
            </div>
          );
        })}
    </div>
  );
};

export default TranslationTreeView;
