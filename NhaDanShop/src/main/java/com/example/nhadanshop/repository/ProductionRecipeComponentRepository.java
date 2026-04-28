package com.example.nhadanshop.repository;

import com.example.nhadanshop.entity.ProductionRecipeComponent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ProductionRecipeComponentRepository extends JpaRepository<ProductionRecipeComponent, Long> {

    List<ProductionRecipeComponent> findByRecipeIdOrderBySortOrderAscIdAsc(Long recipeId);

    void deleteByRecipeId(Long recipeId);
}
