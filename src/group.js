export default class Group {
    constructor(name, index, isPlaceholder = false) {
        this.id = `${isPlaceholder ? 'placeholder-' : ''}${index}`;
        this.name = name;
        this._index = index;
        this.isPlaceholder = isPlaceholder;
        this.tasks = [];
    }

    addTask(task) {
        task._index = this._index;
        this.tasks.push(task);
    }

    createPlaceholder() {
        if (!this.isPlaceholder) {
            const placeholder = {
                id: `placeholder-${this.name}`,
                title: 'Placeholder',
                _index: this._index,
                isPlaceholder: true,
                start: null,
                end: null,
            };
            this.tasks.push(placeholder);
            this.isPlaceholder = true;
        }
    }

    removePlaceholder() {
        this.tasks = this.tasks.filter((task) => !task.isPlaceholder);
        this.isPlaceholder = false;
    }

    removeTask(taskId) {
        this.tasks = this.tasks.filter((task) => task.id !== taskId);
    }

    replacePlaceholder(newTask) {
        this.removePlaceholder();
        this.addTask(newTask);
    }

    getYPosition(options) {
        return (
            options.header_height +
            options.padding +
            this._index * (options.bar_height + options.padding)
        );
    }
}
