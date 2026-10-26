package logic

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/yanzezhong/ai-write/server/internal/model"
	"github.com/yanzezhong/ai-write/server/internal/types"
)

func now() time.Time { return time.Now() }

func primitiveFromHex(hex string) (primitive.ObjectID, error) {
	return primitive.ObjectIDFromHex(hex)
}

func projectToSummaryPtr(p *model.Project) *types.ProjectSummary {
	if p == nil {
		return nil
	}
	s := toSummary(p)
	return &s
}
