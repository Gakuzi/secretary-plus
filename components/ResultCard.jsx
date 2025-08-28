import React from 'react';
import { EditIcon, DeleteIcon, OpenIcon } from './icons/Icons.jsx';

const ResultCard = ({ cardData, onSelection }) => {
    const isSelectionCard = cardData.type === 'contact-selection' || cardData.type === 'document-selection';

    const handleSelect = (option) => {
        if (onSelection) {
            const type = cardData.type === 'contact-selection' ? 'contact' : 'document';
            onSelection(type, option);
        }
    };

    if (isSelectionCard) {
        return (
            <div className="mt-2 bg-gray-800 rounded-lg w-full max-w-md">
                <div className="flex items-center p-4">
                    <span className="text-indigo-400 mr-3">{cardData.icon}</span>
                    <h3 className="font-bold text-lg text-white">{cardData.title}</h3>
                </div>
                <div className="flex flex-col border-t border-gray-600 max-h-60 overflow-y-auto">
                    {cardData.selectionOptions?.map((option) => (
                        <button
                            key={option.id}
                            onClick={() => handleSelect(option)}
                            className="text-left w-full px-4 py-3 hover:bg-gray-700 transition-colors border-b border-gray-600 last:border-b-0"
                        >
                            <p className="font-semibold text-white truncate">{option.label}</p>
                            {option.description && <p className="text-sm text-gray-400 truncate">{option.description}</p>}
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    if (cardData.type === 'document') {
        return (
             <div className="mt-2 p-4 bg-gray-800 rounded-lg border border-gray-600 w-full max-w-md">
                <div className="flex items-center mb-3">
                    <span className="mr-3">{cardData.icon}</span>
                    <h3 className="font-bold text-lg text-white">{cardData.title}</h3>
                </div>
                 <div className="flex items-center justify-end space-x-2 mt-4 pt-3 border-t border-gray-600">
                     {cardData.actions?.map((action) => (
                         <a
                             key={action.label}
                             href={action.url}
                             onClick={action.onClick}
                             target={action.url ? "_blank" : "_self"}
                             rel="noopener noreferrer"
                             className="flex items-center px-3 py-1.5 text-xs font-medium text-gray-300 bg-gray-700 rounded-md hover:bg-gray-600 transition-colors"
                         >
                             {action.label === 'Открыть' && <OpenIcon className="mr-1.5" />}
                             {action.label}
                         </a>
                     ))}
                 </div>
            </div>
        )
    }

    return (
        <div className="mt-2 p-4 bg-gray-800 rounded-lg border border-gray-600 w-full max-w-md">
            <div className="flex items-center mb-3">
                <span className="text-indigo-400 mr-3">{cardData.icon}</span>
                <h3 className="font-bold text-lg text-white">{cardData.title}</h3>
            </div>
            <div className="space-y-2 text-sm text-gray-300">
                {cardData.details && Object.entries(cardData.details).map(([key, value]) => (
                    <div key={key}>
                        <p className="font-semibold text-gray-400 capitalize">{key}:</p>
                        {Array.isArray(value) ? (
                            <ul className="list-disc list-inside pl-2">
                                {value.map((item, index) => <li key={index}>{item}</li>)}
                            </ul>
                        ) : (
                            <p>{value}</p>
                        )}
                    </div>
                ))}
            </div>
            <div className="flex items-center justify-end space-x-2 mt-4 pt-3 border-t border-gray-600">
                {cardData.actions?.map((action) => (
                    <a 
                        key={action.label} 
                        href={action.url}
                        onClick={action.onClick}
                        target={action.url ? "_blank" : "_self"}
                        rel="noopener noreferrer"
                        className="flex items-center px-3 py-1.5 text-xs font-medium text-gray-300 bg-gray-700 rounded-md hover:bg-gray-600 transition-colors"
                    >
                        {action.label === 'Изменить' && <EditIcon className="mr-1.5" />}
                        {action.label === 'Удалить' && <DeleteIcon className="mr-1.5" />}
                        {action.label === 'Открыть' && <OpenIcon className="mr-1.5" />}
                        {action.label}
                    </a>
                ))}
            </div>
        </div>
    );
};

export default ResultCard;